import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email'

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

  const emailResult = await sendInviteEmail({ to: email, orgName: org.name, inviteUrl })
  if (!emailResult.sent) {
    console.error('メール送信エラー:', emailResult.error)
  }

  return NextResponse.json({
    success: true,
    inviteUrl,
    token: invitation.token,
    emailSent: emailResult.sent,
  })
}
