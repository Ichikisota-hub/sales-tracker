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

// アカウント設定時に入力した名前と一致するsales_repをorganization_membersに紐付ける
export async function POST(req: NextRequest) {
  // セッションからユーザーを取得
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

  // Authorizationヘッダーからもトークンを受け付ける（セッションCookieが未設定の場合）
  let userId = user?.id
  if (!userId) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const supabase = getServiceClient()
      const { data: { user: tokenUser } } = await supabase.auth.getUser(token)
      userId = tokenUser?.id
    }
  }

  if (!userId) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { fullName } = await req.json()
  if (!fullName?.trim()) return NextResponse.json({ error: 'fullName が必要です' }, { status: 400 })

  const supabase = getServiceClient()

  // ユーザーのorg membershipを取得
  const { data: membership } = await supabase
    .from('organization_members')
    .select('id, organization_id')
    .eq('user_id', userId)
    .single()

  if (!membership) return NextResponse.json({ error: 'メンバーシップが見つかりません' }, { status: 404 })

  // 同じ組織内で名前が一致するsales_repを検索
  const { data: rep } = await supabase
    .from('sales_reps')
    .select('id, name')
    .eq('organization_id', membership.organization_id)
    .eq('name', fullName.trim())
    .eq('is_active', true)
    .single()

  if (!rep) {
    // 一致する担当者がいなくても正常終了（管理者が後で設定する）
    return NextResponse.json({ success: true, linked: false, message: '一致する担当者が見つかりませんでした' })
  }

  // sales_rep_idを更新
  const { error } = await supabase
    .from('organization_members')
    .update({ sales_rep_id: rep.id })
    .eq('id', membership.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, linked: true, repName: rep.name })
}
