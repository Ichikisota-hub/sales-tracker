import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { email, role, repId, organizationId } = await req.json()
  if (!email || !role || !organizationId) {
    return NextResponse.json({ error: 'email, role, organizationId が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 組織の取得・検証
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, max_members, is_active')
    .eq('id', organizationId)
    .single()

  if (!org) {
    return NextResponse.json({ error: '組織が見つかりません' }, { status: 404 })
  }
  if (!org.is_active) {
    return NextResponse.json({ error: 'このプランは利用停止中です' }, { status: 403 })
  }

  // メンバー上限チェック
  const { count } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact' })
    .eq('organization_id', organizationId)

  if ((count ?? 0) >= (org.max_members ?? 20)) {
    return NextResponse.json({ error: 'メンバー上限に達しています。プランをアップグレードしてください。' }, { status: 403 })
  }

  // 既存の有効な招待があれば削除
  await supabase
    .from('invitations')
    .delete()
    .eq('organization_id', organizationId)
    .eq('email', email)
    .is('accepted_at', null)

  // 新しい招待を作成
  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .insert({
      organization_id: organizationId,
      email,
      role,
      ...(repId ? { rep_id: repId } : {}),
    })
    .select()
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: invError?.message || '招待の作成に失敗しました' }, { status: 500 })
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${invitation.token}`

  // Resend でメール送信（RESEND_API_KEY が設定されている場合のみ）
  if (process.env.RESEND_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Resend } = require('resend') as { Resend: new (key: string) => any }
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
        to: email,
        subject: `${org.name} への招待`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${org.name} に招待されました</h2>
            <p>以下のリンクをクリックして参加してください（7日間有効）:</p>
            <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              招待を受諾する
            </a>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
              このメールに心当たりがない場合は無視してください。
            </p>
          </div>
        `,
      })
    } catch (e) {
      console.error('メール送信エラー:', e)
    }
  }

  return NextResponse.json({ success: true, inviteUrl, token: invitation.token })
}
