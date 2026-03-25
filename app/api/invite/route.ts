import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerSupabase } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  // 認証チェック
  const serverSupabase = await createServerSupabase()
  const { data: { session } } = await serverSupabase.auth.getSession()
  const user = session?.user
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { email, role, repId } = await req.json()
  if (!email || !role) {
    return NextResponse.json({ error: 'email と role が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 呼び出し元の組織を取得
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: '組織が見つかりません' }, { status: 404 })
  }
  if (!['admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: '招待する権限がありません' }, { status: 403 })
  }

  // メンバー上限チェック
  const { data: org } = await supabase
    .from('organizations')
    .select('max_members, is_active')
    .eq('id', membership.organization_id)
    .single()

  if (!org?.is_active) {
    return NextResponse.json({ error: 'このプランは利用停止中です' }, { status: 403 })
  }

  const { count } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact' })
    .eq('organization_id', membership.organization_id)

  if ((count ?? 0) >= (org?.max_members ?? 20)) {
    return NextResponse.json({ error: 'メンバー上限に達しています。プランをアップグレードしてください。' }, { status: 403 })
  }

  // 既存の有効な招待があれば削除
  await supabase
    .from('invitations')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('email', email)
    .is('accepted_at', null)

  // 新しい招待を作成
  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .insert({
      organization_id: membership.organization_id,
      email,
      role,
      invited_by: user.id,
      ...(repId ? { rep_id: repId } : {}),
    })
    .select()
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: invError?.message || '招待の作成に失敗しました' }, { status: 500 })
  }

  const orgName = (membership as any).organizations?.name || 'チーム'
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
        subject: `${orgName} への招待`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${orgName} に招待されました</h2>
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
      // メール送信失敗しても招待は作成済みなので続行
    }
  }

  return NextResponse.json({ success: true, inviteUrl, token: invitation.token })
}
