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

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const supabase = getServiceClient()

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, slug, plan, trial_ends_at, max_members, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 各組織のメンバー数を取得
  const orgIds = (orgs || []).map(o => o.id)
  const memberCounts: Record<string, number> = {}

  if (orgIds.length > 0) {
    const { data: members } = await supabase
      .from('organization_members')
      .select('organization_id')
      .in('organization_id', orgIds)

    ;(members || []).forEach(m => {
      memberCounts[m.organization_id] = (memberCounts[m.organization_id] || 0) + 1
    })
  }

  const result = (orgs || []).map(o => ({
    ...o,
    member_count: memberCounts[o.id] || 0,
  }))

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { id, plan, max_members, is_active, trial_ends_at } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  const update: Record<string, unknown> = {}
  if (plan !== undefined) update.plan = plan
  if (max_members !== undefined) update.max_members = max_members
  if (is_active !== undefined) update.is_active = is_active
  if (trial_ends_at !== undefined) update.trial_ends_at = trial_ends_at || null

  const { error } = await supabase
    .from('organizations')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
