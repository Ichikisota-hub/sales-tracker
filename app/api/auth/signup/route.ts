import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service Role クライアント（RLS をバイパス）
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { userId, orgName, slug } = await req.json()

  if (!userId || !orgName || !slug) {
    return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 1. 組織を作成
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName, slug })
    .select()
    .single()

  if (orgError || !org) {
    return NextResponse.json({ error: orgError?.message || '組織の作成に失敗しました' }, { status: 500 })
  }

  // 2. メールアドレスを確認済みにする（メール確認フローをスキップ）
  const { error: confirmError } = await supabase.auth.admin.updateUserById(userId, {
    email_confirm: true,
  })
  if (confirmError) {
    console.error('email confirm error:', confirmError)
    // 失敗しても続行（Supabase設定でメール確認不要の場合もある）
  }

  // 3. 作成者を admin として organization_members に追加
  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'admin',
    })

  if (memberError) {
    // ロールバック: 作成した組織を削除
    await supabase.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({ organizationId: org.id })
}
