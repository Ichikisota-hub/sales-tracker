import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 管理者がメンバーを招待する（Supabase Auth invite / repId をメタデータに埋め込む）
export async function POST(req: NextRequest) {
  // 呼び出し元のセッションを確認
  const cookieStore = cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabaseUser.auth.getUser()

  // Authorizationヘッダーからも受け付ける
  let callerId = user?.id
  const supabaseAdmin = getServiceClient()
  if (!callerId) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const { data: { user: tokenUser } } = await supabaseAdmin.auth.getUser(token)
      callerId = tokenUser?.id
    }
  }

  if (!callerId) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { email, role, organizationId, repId } = await req.json()
  if (!email || !organizationId) {
    return NextResponse.json({ error: 'email と organizationId が必要です' }, { status: 400 })
  }

  // 呼び出し元が admin または manager かチェック
  const { data: callerMembership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('user_id', callerId)
    .eq('organization_id', organizationId)
    .single()

  if (!callerMembership || !['admin', 'manager'].includes(callerMembership.role)) {
    return NextResponse.json({ error: 'この操作には管理者権限が必要です' }, { status: 403 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sales-tracker-pied.vercel.app'

  // 既存ユーザーを確認
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

  let inviteLink: string | null = null
  let targetUser = existingUser ?? null

  const inviteMetadata: Record<string, string> = {
    invited_to_org: organizationId,
    ...(repId ? { sales_rep_id: repId } : {}),
  }

  if (!existingUser) {
    // 新規: Supabase Auth 招待リンクを生成（repId をメタデータに埋め込む）
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: inviteMetadata,
        redirectTo: `${appUrl}/reset-password`,
      },
    })
    if (linkError) {
      return NextResponse.json({ error: `招待リンク生成失敗: ${linkError.message}` }, { status: 500 })
    }
    targetUser = linkData.user
    inviteLink = linkData.properties?.action_link ?? null
  } else {
    // 既存ユーザー: マジックリンクを生成
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${appUrl}/reset-password` },
    })
    if (!linkError) {
      inviteLink = linkData.properties?.action_link ?? null
    }
  }

  if (!targetUser) {
    return NextResponse.json({ error: 'ユーザー作成に失敗しました' }, { status: 500 })
  }

  // 既にメンバーかチェック
  const { data: existingMember } = await supabaseAdmin
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', targetUser.id)
    .single()

  if (!existingMember) {
    const { error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: targetUser.id,
        role: role || 'member',
        joined_at: new Date().toISOString(),
        ...(repId ? { sales_rep_id: repId } : {}),
      })

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 })
    }
  } else if (repId) {
    // 既存メンバーなら repId だけ更新
    await supabaseAdmin
      .from('organization_members')
      .update({ sales_rep_id: repId })
      .eq('id', existingMember.id)
  }

  return NextResponse.json({
    success: true,
    inviteLink,
    isExisting: !!existingUser,
    email,
  })
}
