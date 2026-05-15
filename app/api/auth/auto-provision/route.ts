import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ORIGIN_ORG_ID = '0524dcfa-685f-4635-971b-39c7899da7cd'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// kaika.org等の外部経路でアカウントを作ったユーザーを ORIGIN org に member として自動登録する
export async function POST(req: NextRequest) {
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

  let userId = user?.id
  if (!userId) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const { data: { user: tokenUser } } = await getServiceClient().auth.getUser(token)
      userId = tokenUser?.id
    }
  }
  if (!userId) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const supabase = getServiceClient()

  // 既存 membership チェック
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id, sales_rep_id')
    .eq('user_id', userId)
    .eq('organization_id', ORIGIN_ORG_ID)
    .maybeSingle()

  // membership があり、sales_rep_id も設定済みなら何もしない
  if (existing?.sales_rep_id) {
    return NextResponse.json({ success: true, provisioned: false, message: '既にメンバーシップがあります' })
  }

  // membership なし → 新規作成
  let memberId: string

  if (!existing) {
    // ORIGIN org の存在確認
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, is_active')
      .eq('id', ORIGIN_ORG_ID)
      .single()

    if (!org || !org.is_active) {
      return NextResponse.json({ error: '組織が見つかりません' }, { status: 404 })
    }

    const { data: newMember, error: memberErr } = await supabase
      .from('organization_members')
      .insert({
        organization_id: ORIGIN_ORG_ID,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (memberErr || !newMember) {
      return NextResponse.json({ error: memberErr?.message || 'メンバー追加に失敗しました' }, { status: 500 })
    }
    memberId = newMember.id
  } else {
    // membership あり、sales_rep_id だけ未設定
    memberId = existing.id
  }

  // ユーザーの名前を取得
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
  const fullName = (authUser?.user_metadata?.full_name as string | undefined)?.trim()

  if (fullName) {
    // 既存 sales_rep を名前マッチで検索
    const { data: rep } = await supabase
      .from('sales_reps')
      .select('id, name')
      .eq('organization_id', ORIGIN_ORG_ID)
      .eq('name', fullName)
      .eq('is_active', true)
      .maybeSingle()

    let repId: string | null = rep?.id ?? null

    if (!repId) {
      // 存在しない場合は自動作成
      const { data: maxRep } = await supabase
        .from('sales_reps')
        .select('display_order')
        .eq('organization_id', ORIGIN_ORG_ID)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: newRep } = await supabase
        .from('sales_reps')
        .insert({
          organization_id: ORIGIN_ORG_ID,
          name: fullName,
          is_active: true,
          display_order: (maxRep?.display_order ?? 0) + 1,
        })
        .select('id')
        .single()

      repId = newRep?.id ?? null
    }

    if (repId) {
      await supabase
        .from('organization_members')
        .update({ sales_rep_id: repId })
        .eq('id', memberId)
    }
  }

  return NextResponse.json({ success: true, provisioned: true })
}
