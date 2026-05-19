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

  const body = await req.json()
  const { fullName, repId: directRepId } = body
  if (!fullName?.trim()) return NextResponse.json({ error: 'fullName が必要です' }, { status: 400 })

  const supabase = getServiceClient()

  // ユーザーのorg membershipを取得
  const { data: membership } = await supabase
    .from('organization_members')
    .select('id, organization_id')
    .eq('user_id', userId)
    .single()

  if (!membership) return NextResponse.json({ error: 'メンバーシップが見つかりません' }, { status: 404 })

  // ── 方式0: RepLinkScreenからIDが直接渡された場合（同名重複を回避）──
  if (directRepId) {
    const { data: directRep } = await supabase
      .from('sales_reps')
      .select('id, name')
      .eq('id', directRepId)
      .eq('organization_id', membership.organization_id)
      .eq('is_active', true)
      .single()
    if (directRep) {
      const { error } = await supabase
        .from('organization_members')
        .update({ sales_rep_id: directRep.id })
        .eq('id', membership.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, linked: true, repName: directRep.name, method: 'direct_id' })
    }
  }

  // ── 方式1: user_metadataにsales_rep_idがあればIDで直接紐付け ──
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
  const metadataRepId = authUser?.user_metadata?.sales_rep_id as string | undefined

  if (metadataRepId) {
    // メタデータで指定されたrepが同組織のものか確認
    const { data: metaRep } = await supabase
      .from('sales_reps')
      .select('id, name')
      .eq('id', metadataRepId)
      .eq('organization_id', membership.organization_id)
      .eq('is_active', true)
      .single()

    if (metaRep) {
      const { error } = await supabase
        .from('organization_members')
        .update({ sales_rep_id: metaRep.id })
        .eq('id', membership.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, linked: true, repName: metaRep.name, method: 'metadata' })
    }
  }

  // ── 方式2: 名前マッチ（フォールバック）──
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

  // 同じ担当者が既に別のメンバーに紐付いていないかチェック（重複防止）
  const { data: alreadyLinked } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', membership.organization_id)
    .eq('sales_rep_id', rep.id)
    .neq('user_id', userId)
    .maybeSingle()

  if (alreadyLinked) {
    return NextResponse.json({
      success: true,
      linked: false,
      message: 'この担当者は既に別のメンバーに紐付いています。管理者が担当者を設定します。',
    })
  }

  // sales_rep_idを更新
  const { error } = await supabase
    .from('organization_members')
    .update({ sales_rep_id: rep.id })
    .eq('id', membership.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, linked: true, repName: rep.name, method: 'name' })
}
