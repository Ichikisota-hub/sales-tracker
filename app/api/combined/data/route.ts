import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 全代理店合計データ取得API (service role でRLSをバイパス)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const orgIdsParam = searchParams.get('orgIds') // カンマ区切り
  const yearMonth = searchParams.get('yearMonth')

  if (!orgIdsParam || !yearMonth) {
    return NextResponse.json({ error: 'orgIds, yearMonth が必要です' }, { status: 400 })
  }

  const orgIds = orgIdsParam.split(',').filter(Boolean)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [yStr, mStr] = yearMonth.split('-')
  const lastDay = new Date(parseInt(yStr), parseInt(mStr), 0).getDate()
  const dateFrom = `${yStr}-${mStr}-01`
  const dateTo = `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`

  const [repsRes, teamsRes, recordsRes, schedulesRes, plansRes, contractsRes, reportsRes] =
    await Promise.all([
      supabase.from('sales_reps').select('*').eq('is_active', true).in('organization_id', orgIds).order('display_order'),
      supabase.from('teams').select('*').in('organization_id', orgIds).order('display_order'),
      supabase.from('daily_records').select('*').gte('record_date', dateFrom).lte('record_date', dateTo).in('organization_id', orgIds),
      supabase.from('work_schedules').select('sales_rep_id,schedule_date,work_status').gte('schedule_date', dateFrom).lte('schedule_date', dateTo).in('organization_id', orgIds),
      supabase.from('monthly_plans').select('*').eq('year_month', yearMonth).in('organization_id', orgIds),
      supabase.from('contracts').select('*').in('organization_id', orgIds).order('acquired_date', { ascending: false }),
      supabase.from('daily_reports').select('*').gte('report_date', dateFrom).lte('report_date', dateTo).in('organization_id', orgIds),
    ])

  return NextResponse.json({
    reps: repsRes.data ?? [],
    teams: teamsRes.data ?? [],
    records: recordsRes.data ?? [],
    schedules: schedulesRes.data ?? [],
    plans: plansRes.data ?? [],
    contracts: contractsRes.data ?? [],
    reports: reportsRes.data ?? [],
  })
}
