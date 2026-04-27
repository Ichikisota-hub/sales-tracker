import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: メンバー一覧（メールアドレス付き）
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get('organizationId')
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // organization_members 取得
  const { data: members, error: membersError } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', organizationId)
    .order('joined_at')

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  // auth.admin でユーザーのメール一覧取得
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  })

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  // user_id → email のマップ
  const emailMap: Record<string, string> = {}
  for (const u of usersData.users) {
    emailMap[u.id] = u.email ?? ''
  }

  const result = (members ?? []).map(m => ({
    ...m,
    email: emailMap[m.user_id] ?? '',
  }))

  return NextResponse.json({ members: result })
}

// PATCH: メンバーの sales_rep_id を更新
export async function PATCH(req: NextRequest) {
  const { memberId, salesRepId } = await req.json()
  if (!memberId) {
    return NextResponse.json({ error: 'memberId が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  const { error } = await supabase
    .from('organization_members')
    .update({ sales_rep_id: salesRepId ?? null })
    .eq('id', memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
