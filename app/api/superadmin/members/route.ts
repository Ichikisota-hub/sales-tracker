import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_KEY = 'Origin0201'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function checkAuth(req: NextRequest) {
  return req.headers.get('x-superadmin-key') === SUPERADMIN_KEY
}

// 組織のメンバー一覧取得
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) {
    return NextResponse.json({ error: 'orgId が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  const { data: members, error } = await supabase
    .from('organization_members')
    .select('id, user_id, role, joined_at, sales_rep_id')
    .eq('organization_id', orgId)
    .order('joined_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // メールアドレスをauth.usersから取得
  const userIds = (members || []).map(m => m.user_id)
  const emails: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    users.forEach(u => { emails[u.id] = u.email ?? u.id })
  }

  const result = (members || []).map(m => ({
    ...m,
    email: emails[m.user_id] ?? m.user_id,
  }))

  return NextResponse.json(result)
}

// メンバー削除
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { memberId } = await req.json()
  if (!memberId) {
    return NextResponse.json({ error: 'memberId が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
