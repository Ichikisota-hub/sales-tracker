import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = getServiceClient()

  const [
    { data: salesReps },
    { data: teams },
    { data: contracts },
    { data: dailyRecords },
    { data: dailyReports },
    { data: monthlyPlans },
    { data: workSchedules },
  ] = await Promise.all([
    supabase.from('sales_reps').select('id, name, team_id, display_order, is_active, created_at').order('display_order'),
    supabase.from('teams').select('id, name, display_order, created_at').order('display_order'),
    supabase.from('contracts').select('*').order('created_at'),
    supabase.from('daily_records').select('*').order('record_date'),
    supabase.from('daily_reports').select('*').order('report_date'),
    supabase.from('monthly_plans').select('*').order('year_month'),
    supabase.from('work_schedules').select('*').order('schedule_date'),
  ])

  // 担当者IDを名前に変換するマップ
  const repMap: Record<string, string> = {}
  const teamMap: Record<string, string> = {}
  ;(salesReps || []).forEach(r => { repMap[r.id] = r.name })
  ;(teams || []).forEach(t => { teamMap[t.id] = t.name })

  const wb = XLSX.utils.book_new()

  // ── 担当者 ──
  const repsRows = (salesReps || []).map(r => ({
    ID: r.id,
    名前: r.name,
    チーム: teamMap[r.team_id] || '',
    表示順: r.display_order,
    有効: r.is_active ? '有効' : '非表示',
    作成日: r.created_at?.slice(0, 10),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repsRows), '担当者')

  // ── チーム ──
  const teamsRows = (teams || []).map(t => ({
    ID: t.id,
    チーム名: t.name,
    表示順: t.display_order,
    作成日: t.created_at?.slice(0, 10),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamsRows), 'チーム')

  // ── 月間計画 ──
  const plansRows = (monthlyPlans || []).map(r => ({
    担当者: repMap[r.sales_rep_id] || r.sales_rep_id,
    年月: r.year_month,
    計画件数: r.plan_cases,
    計画稼働日数: r.plan_working_days,
    備考: r.note || '',
    更新日: r.updated_at?.slice(0, 10),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plansRows), '月間計画')

  // ── 日別実績 ──
  const recordsRows = (dailyRecords || []).map(r => ({
    担当者: repMap[r.sales_rep_id] || r.sales_rep_id,
    日付: r.record_date,
    稼働状況: r.work_status,
    出勤状況: r.attendance_status,
    稼働時間: r.working_hours,
    開始時刻: r.work_time_start,
    終了時刻: r.work_time_end,
    訪問件数: r.visits,
    ネット対面: r.net_meetings,
    主権対面: r.owner_meetings,
    商談件数: r.negotiations,
    獲得件数: r.acquisitions,
    都道府県: r.area_pref,
    市区町村: r.area_city,
    更新日: r.updated_at?.slice(0, 10),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recordsRows), '日別実績')

  // ── シフト ──
  const schedulesRows = (workSchedules || []).map(r => ({
    担当者: repMap[r.sales_rep_id] || r.sales_rep_id,
    日付: r.schedule_date,
    稼働状況: r.work_status,
    開始時刻: r.work_time_start,
    終了時刻: r.work_time_end,
    更新日: r.updated_at?.slice(0, 10),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedulesRows), 'シフト')

  // ── 契約宅 ──
  const contractsRows = (contracts || []).map(r => ({
    担当者: repMap[r.sales_rep_id] || r.sales_rep_id,
    顧客名: r.customer_name,
    電話番号: r.phone,
    住所: r.address,
    都道府県: r.area_pref,
    市区町村: r.area_city,
    WiFiプロバイダ: r.wifi_provider,
    獲得日: r.acquired_date,
    工事日: r.construction_date || '',
    工事連絡: r.construction_called ? '済' : '未',
    ステータス: r.status,
    備考: r.notes || '',
    作成日: r.created_at?.slice(0, 10),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contractsRows), '契約宅')

  // ── 日報 ──
  const reportsRows = (dailyReports || []).map(r => ({
    担当者: repMap[r.sales_rep_id] || r.sales_rep_id,
    日付: r.report_date,
    訪問件数: r.visits,
    ネット対面: r.net_meetings,
    主権対面: r.owner_meetings,
    商談件数: r.negotiations,
    獲得件数: r.acquisitions,
    獲得案件: r.acquisition_case || '',
    失注案件: r.lost_case || '',
    残稼働: r.remaining_work || '',
    良かった点: r.good_points || '',
    課題: r.issues || '',
    改善策: r.improvements || '',
    学び: r.learnings || '',
    感謝: r.gratitude || '',
    作成日: r.created_at?.slice(0, 10),
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportsRows), '日報')

  // Excelファイルをバッファに書き出し
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sales-tracker-${today}.xlsx"`,
    },
  })
}
