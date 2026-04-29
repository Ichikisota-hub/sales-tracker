import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// Service Account 認証
function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません')
  const key = JSON.parse(keyJson)
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// シートが存在しなければ作成し、sheetIdを返す
async function ensureSheet(sheets: any, spreadsheetId: string, sheetTitle: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existing = meta.data.sheets?.find((s: any) => s.properties?.title === sheetTitle)
  if (existing) return existing.properties!.sheetId!

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetTitle } } }],
    },
  })
  return res.data.replies![0].addSheet!.properties!.sheetId!
}

// ヘッダー行を太字にする
async function formatHeader(sheets: any, spreadsheetId: string, sheetId: number, colCount: number) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  })
}

// 1シートを全クリア → データ書き込み
async function writeSheet(sheets: any, spreadsheetId: string, sheetTitle: string, rows: any[][]) {
  const sheetId = await ensureSheet(sheets, spreadsheetId, sheetTitle)

  // クリア
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetTitle}!A:ZZ` })

  if (rows.length === 0) return

  // データ書き込み
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })

  // ヘッダー書式
  await formatHeader(sheets, spreadsheetId, sheetId, rows[0].length)
}

// 全データを同期する
export async function syncAllToSheets(spreadsheetId: string, orgIds?: string[]) {
  const supabase = getServiceSupabase()
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // データ取得
  let repsQuery = supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order')
  let teamsQuery = supabase.from('teams').select('*').order('display_order')
  let recordsQuery = supabase.from('daily_records').select('*').order('record_date')
  let schedulesQuery = supabase.from('work_schedules').select('*').order('schedule_date')
  let plansQuery = supabase.from('monthly_plans').select('*').order('year_month')
  let contractsQuery = supabase.from('contracts').select('*').order('acquired_date', { ascending: false })
  let reportsQuery = supabase.from('daily_reports').select('*').order('report_date')

  if (orgIds && orgIds.length > 0) {
    repsQuery = repsQuery.in('organization_id', orgIds) as any
    teamsQuery = teamsQuery.in('organization_id', orgIds) as any
    recordsQuery = recordsQuery.in('organization_id', orgIds) as any
    schedulesQuery = schedulesQuery.in('organization_id', orgIds) as any
    plansQuery = plansQuery.in('organization_id', orgIds) as any
    contractsQuery = contractsQuery.in('organization_id', orgIds) as any
    reportsQuery = reportsQuery.in('organization_id', orgIds) as any
  }

  const [
    { data: salesReps },
    { data: teams },
    { data: dailyRecords },
    { data: workSchedules },
    { data: monthlyPlans },
    { data: contracts },
    { data: dailyReports },
  ] = await Promise.all([repsQuery, teamsQuery, recordsQuery, schedulesQuery, plansQuery, contractsQuery, reportsQuery])

  const repMap: Record<string, string> = {}
  const teamMap: Record<string, string> = {}
  ;(salesReps || []).forEach(r => { repMap[r.id] = r.name })
  ;(teams || []).forEach(t => { teamMap[t.id] = t.name })

  // ── 担当者 ──
  const repsRows: any[][] = [['名前', 'チーム', '表示順', '有効', '作成日']]
  for (const r of salesReps || []) {
    repsRows.push([r.name, teamMap[r.team_id] || '', r.display_order, r.is_active ? '有効' : '非表示', r.created_at?.slice(0, 10)])
  }
  await writeSheet(sheets, spreadsheetId, '担当者', repsRows)

  // ── 月間計画 ──
  const plansRows: any[][] = [['担当者', '年月', '計画件数', '計画稼働日数', '備考', '更新日']]
  for (const r of monthlyPlans || []) {
    plansRows.push([repMap[r.sales_rep_id] || r.sales_rep_id, r.year_month, r.plan_cases, r.plan_working_days, r.note || '', r.updated_at?.slice(0, 10)])
  }
  await writeSheet(sheets, spreadsheetId, '月間計画', plansRows)

  // ── 日別実績 ──
  const recordsRows: any[][] = [['担当者', '日付', '稼働状況', '出勤状況', '稼働時間', '開始時刻', '終了時刻', '訪問', 'インターホンのみ', '対面数', '紙プレ', 'フルトーク', '宅内IN', '主権対面', '商談', '見込み', '受注', '都道府県', '市区町村', '更新日']]
  for (const r of dailyRecords || []) {
    recordsRows.push([
      repMap[r.sales_rep_id] || r.sales_rep_id, r.record_date, r.work_status, r.attendance_status,
      r.working_hours, r.work_time_start, r.work_time_end,
      r.visits, r.interphone_only, r.net_meetings, r.paper_presentation, r.full_talk, r.indoor_entry,
      r.owner_meetings, r.negotiations, r.prospects, r.acquisitions,
      r.area_pref, r.area_city, r.updated_at?.slice(0, 10),
    ])
  }
  await writeSheet(sheets, spreadsheetId, '日別実績', recordsRows)

  // ── シフト ──
  const schedulesRows: any[][] = [['担当者', '日付', '稼働状況', '開始時刻', '終了時刻', '更新日']]
  for (const r of workSchedules || []) {
    schedulesRows.push([repMap[r.sales_rep_id] || r.sales_rep_id, r.schedule_date, r.work_status, r.work_time_start, r.work_time_end, r.updated_at?.slice(0, 10)])
  }
  await writeSheet(sheets, spreadsheetId, 'シフト', schedulesRows)

  // ── 契約宅 ──
  const contractsRows: any[][] = [['担当者', '顧客名', '電話番号', '住所', '都道府県', '市区町村', 'WiFiプロバイダ', '獲得日', '工事日', '工事連絡', 'ステータス', '備考', '作成日']]
  for (const r of contracts || []) {
    contractsRows.push([
      repMap[r.sales_rep_id] || r.sales_rep_id, r.customer_name, r.phone, r.address,
      r.area_pref, r.area_city, r.wifi_provider,
      r.acquired_date, r.construction_date || '', r.construction_called ? '済' : '未',
      r.status, r.notes || '', r.created_at?.slice(0, 10),
    ])
  }
  await writeSheet(sheets, spreadsheetId, '契約宅', contractsRows)

  // ── 日報 ──
  const reportsRows: any[][] = [['担当者', '日付', '訪問', 'インターホンのみ', '対面数', '紙プレ', 'フルトーク', '宅内IN', '主権対面', '商談', '見込み', '受注', '獲得案件', '失注案件', '残稼働', '良かった点', '課題', '改善策', '学び', '感謝', '作成日']]
  for (const r of dailyReports || []) {
    reportsRows.push([
      repMap[r.sales_rep_id] || r.sales_rep_id, r.report_date,
      r.visits, r.interphone_only, r.net_meetings, r.paper_presentation, r.full_talk, r.indoor_entry,
      r.owner_meetings, r.negotiations, r.prospects, r.acquisitions,
      r.acquisition_case || '', r.lost_case || '', r.remaining_work || '',
      r.good_points || '', r.issues || '', r.improvements || '', r.learnings || '', r.gratitude || '',
      r.created_at?.slice(0, 10),
    ])
  }
  await writeSheet(sheets, spreadsheetId, '日報', reportsRows)

  return {
    reps: (salesReps || []).length,
    records: (dailyRecords || []).length,
    schedules: (workSchedules || []).length,
    plans: (monthlyPlans || []).length,
    contracts: (contracts || []).length,
    reports: (dailyReports || []).length,
  }
}
