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
  const userMap: Record<string, { email: string; email_confirmed_at: string | null; last_sign_in_at: string | null }> = {}
  users.forEach(u => {
    userMap[u.id] = {
      email: u.email ?? u.id,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }
  })

  const result = (members || []).map(m => ({
    ...m,
    email: userMap[m.user_id]?.email ?? m.user_id,
    email_confirmed: !!userMap[m.user_id]?.email_confirmed_at,
    last_sign_in_at: userMap[m.user_id]?.last_sign_in_at ?? null,
  }))

  return NextResponse.json(result)
}

// メンバー招待 (POST)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { orgId, email, role } = await req.json()
  if (!orgId || !email) return NextResponse.json({ error: 'orgId と email が必要です' }, { status: 400 })

  const supabase = getServiceClient()

  // 既存ユーザーを検索
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

  let targetUser = existingUser ?? null
  let inviteLink: string | null = null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sales-tracker-pied.vercel.app'

  if (!existingUser) {
    // 新規: 招待リンクを生成
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { invited_to_org: orgId },
        redirectTo: `${appUrl}/reset-password`,
      },
    })
    if (linkError) return NextResponse.json({ error: `招待リンク生成失敗: ${linkError.message}` }, { status: 500 })
    targetUser = linkData.user
    inviteLink = linkData.properties?.action_link ?? null
  } else {
    // 既存ユーザー: マジックリンク（ワンクリックログイン）を生成
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${appUrl}/` },
    })
    if (!linkError) {
      inviteLink = linkData.properties?.action_link ?? null
    }
  }

  if (!targetUser) return NextResponse.json({ error: 'ユーザー作成に失敗しました' }, { status: 500 })

  // 既にメンバーかチェック
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', targetUser.id)
    .single()

  if (existing) return NextResponse.json({ error: '既にこの組織のメンバーです' }, { status: 400 })

  // organization_members に追加
  const { error: memberError } = await supabase.from('organization_members').insert({
    organization_id: orgId,
    user_id: targetUser.id,
    role: role || 'member',
    joined_at: new Date().toISOString(),
  })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    email,
    userId: targetUser.id,
    inviteLink,
    isExisting: !!existingUser,
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
