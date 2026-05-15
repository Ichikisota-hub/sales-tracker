import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_KEY = 'Origin0201'
const ORIGIN_ORG_ID = '0524dcfa-685f-4635-971b-39c7899da7cd'

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

// ── GET: 現状確認 ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const supabase = getServiceClient()

  const [
    { count: nullReps },
    { count: nullTeams },
    { count: nullSchedules },
    { count: nullPlans },
    { count: nullRecords },
    { count: unlinkedMembers },
  ] = await Promise.all([
    supabase.from('sales_reps').select('id', { count: 'exact', head: true }).is('organization_id', null),
    supabase.from('teams').select('id', { count: 'exact', head: true }).is('organization_id', null),
    supabase.from('work_schedules').select('id', { count: 'exact', head: true }).is('organization_id', null),
    supabase.from('monthly_plans').select('id', { count: 'exact', head: true }).is('organization_id', null),
    supabase.from('daily_records').select('id', { count: 'exact', head: true }).is('organization_id', null),
    supabase.from('organization_members').select('id', { count: 'exact', head: true })
      .eq('organization_id', ORIGIN_ORG_ID)
      .is('sales_rep_id', null),
  ])

  return NextResponse.json({
    nullOrgId: {
      sales_reps: nullReps,
      teams: nullTeams,
      work_schedules: nullSchedules,
      monthly_plans: nullPlans,
      daily_records: nullRecords,
    },
    unlinkedMembers,
  })
}

// ── POST: 全修復実行 ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const supabase = getServiceClient()
  const stats: Record<string, number> = {}

  // 1. organization_id = NULL のレコードを ORIGIN に一括バックフィル
  const tables = [
    'sales_reps', 'teams', 'work_schedules',
    'monthly_plans', 'daily_records', 'contracts', 'daily_reports',
  ] as const

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .update({ organization_id: ORIGIN_ORG_ID })
      .is('organization_id', null)
      .select('id')
    if (!error) stats[`${table}_backfilled`] = data?.length ?? 0
  }

  // 2. Origin の organization_members で sales_rep_id = NULL のユーザーを処理
  const { data: unlinkedMembers } = await supabase
    .from('organization_members')
    .select('id, user_id')
    .eq('organization_id', ORIGIN_ORG_ID)
    .is('sales_rep_id', null)

  if (!unlinkedMembers || unlinkedMembers.length === 0) {
    stats.members_linked = 0
    return NextResponse.json({ success: true, stats })
  }

  // Auth ユーザー情報を一括取得
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const userMap = new Map(users.map(u => [u.id, u]))

  // 既存の sales_reps (Origin) を名前マップ
  const { data: existingReps } = await supabase
    .from('sales_reps')
    .select('id, name')
    .eq('organization_id', ORIGIN_ORG_ID)
    .eq('is_active', true)
  const repByName = new Map((existingReps ?? []).map(r => [r.name, r.id]))

  // 次の display_order を計算
  const { data: maxRepRow } = await supabase
    .from('sales_reps')
    .select('display_order')
    .eq('organization_id', ORIGIN_ORG_ID)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  let nextOrder = (maxRepRow?.display_order ?? 0) + 1

  // 既存のすべての sales_reps（organization_id問わず）も名前マップに追加
  const { data: allReps } = await supabase
    .from('sales_reps')
    .select('id, name, organization_id')
    .eq('is_active', true)
  const repByNameAll = new Map((allReps ?? []).map(r => [r.name, r.id]))

  let linked = 0

  for (const member of unlinkedMembers) {
    const authUser = userMap.get(member.user_id)
    const fullName = (authUser?.user_metadata?.full_name as string | undefined)?.trim()
    // full_name がない場合はメールアドレスから表示名を推定しない（管理者が手動設定）
    if (!fullName) continue

    // ORIGIN名前マップ → 全体名前マップ の順で検索
    let repId = repByName.get(fullName) ?? repByNameAll.get(fullName)

    if (!repId) {
      // 既存の rep がいない場合は新規作成
      const { data: newRep } = await supabase
        .from('sales_reps')
        .insert({
          organization_id: ORIGIN_ORG_ID,
          name: fullName,
          is_active: true,
          display_order: nextOrder++,
        })
        .select('id')
        .single()
      if (newRep) {
        repId = newRep.id
        repByName.set(fullName, repId)
      }
    }

    if (repId) {
      // 他のメンバーに既にリンクされていないか確認
      const { data: alreadyLinked } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', ORIGIN_ORG_ID)
        .eq('sales_rep_id', repId)
        .neq('user_id', member.user_id)
        .maybeSingle()

      if (!alreadyLinked) {
        await supabase
          .from('organization_members')
          .update({ sales_rep_id: repId })
          .eq('id', member.id)
        linked++
      }
    }
  }

  stats.members_linked = linked

  return NextResponse.json({ success: true, stats })
}
