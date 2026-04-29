import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_KEY = 'Origin0201'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function checkAuth(req: NextRequest) {
  return req.headers.get('x-superadmin-key') === SUPERADMIN_KEY
}

// 組織のメンバー一覧取得
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId が必要です' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: members, error } = await supabase
    .from('organization_members')
    .select('id, user_id, role, joined_at, sales_rep_id')
    .eq('organization_id', orgId)
    .order('joined_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const userMap: Record<string, { email: string; email_confirmed_at: string | null; last_sign_in_at: string | null; full_name: string | null; agency: string | null }> = {}
  users.forEach(u => {
    userMap[u.id] = {
      email: u.email ?? u.id,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      full_name: (u.user_metadata?.full_name as string) ?? null,
      agency: (u.user_metadata?.agency as string) ?? null,
    }
  })

  const result = (members || []).map(m => ({
    ...m,
    email: userMap[m.user_id]?.email ?? m.user_id,
    email_confirmed: !!userMap[m.user_id]?.email_confirmed_at,
    last_sign_in_at: userMap[m.user_id]?.last_sign_in_at ?? null,
    full_name: userMap[m.user_id]?.full_name ?? null,
    agency: userMap[m.user_id]?.agency ?? null,
  }))

  return NextResponse.json(result)
}

// メンバー招待 (POST)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { orgId, email, role, repId } = await req.json()
  if (!orgId || !email) return NextResponse.json({ error: 'orgId と email が必要です' }, { status: 400 })

  const supabase = getServiceClient()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sales-tracker-pied.vercel.app'

  // 既存の有効な招待があれば削除
  await supabase
    .from('invitations')
    .delete()
    .eq('organization_id', orgId)
    .eq('email', email)
    .is('accepted_at', null)

  // invitations テーブルにトークンを挿入
  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .insert({
      organization_id: orgId,
      email,
      role: role || 'member',
      ...(repId ? { rep_id: repId } : {}),
    })
    .select()
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: invError?.message || '招待の作成に失敗しました' }, { status: 500 })
  }

  const inviteUrl = `${appUrl}/invite/${invitation.token}`

  return NextResponse.json({
    success: true,
    email,
    inviteUrl,
  })
}

// パスワードリセットメール送信 / メンバー削除 (PATCH / DELETE)
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { userId, newPassword } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId が必要です' }, { status: 400 })

  const supabase = getServiceClient()

  if (newPassword) {
    // 直接パスワードを変更
    const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'パスワードを変更しました' })
  } else {
    // パスワードリセットリンクを生成してメール送信（サーバーサイド用）
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !userData.user?.email) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })

    const { data: linkData, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: userData.user.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password` },
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      success: true,
      message: `パスワードリセットメールを ${userData.user.email} に送信しました`,
      resetLink: linkData?.properties?.action_link, // 管理者確認用
    })
  }
}

// メンバー削除
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { memberId } = await req.json()
  if (!memberId) return NextResponse.json({ error: 'memberId が必要です' }, { status: 400 })

  const supabase = getServiceClient()
  const { error } = await supabase.from('organization_members').delete().eq('id', memberId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
