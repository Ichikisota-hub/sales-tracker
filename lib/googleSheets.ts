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

// ヘッダー行を太字にする + オートフィルターを設定
async function formatHeaderAndFilter(sheets: any, spreadsheetId: string, sheetId: number, colCount: number) {
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
        {
          // オートフィルター設定（代理店・名前等で絞り込み可能）
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 0,
                startColumnIndex: 0,
                endColumnIndex: colCount,
              },
            },
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

  // ヘッダー書式 + オートフィルター
  await formatHeaderAndFilter(sheets, spreadsheetId, sheetId, rows[0].length)
}

// バックアップ用: 既存シートを消さず、日付サフィックス付きで書き込む
async function writeBackupSheet(sheets: any, spreadsheetId: string, sheetTitle: string, rows: any[][]) {
  if (rows.length === 0) return
  const sheetId = await ensureSheet(sheets, spreadsheetId, sheetTitle)

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetTitle}!A:ZZ` })

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })

  await formatHeaderAndFilter(sheets, spreadsheetId, sheetId, rows[0].length)
}

// 共通: データ取得
async function fetchAllData(supabase: any, orgIds?: string[]) {
  let repsQuery = supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order')
  let teamsQuery = supabase.from('teams').select('*').order('display_order')
  let recordsQuery = supabase.from('daily_records').select('*').order('record_date')
  let schedulesQuery = supabase.from('work_schedules').select('*').order('schedule_date')
  let plansQuery = supabase.from('monthly_plans').select('*').order('year_month')
  let contractsQuery = supabase.from('contracts').select('*').order('acquired_date', { ascending: false })
  let reportsQuery = supabase.from('daily_reports').select('*').order('report_date')
  let orgsQuery = supabase.from('organizations').select('id, name')

  if (orgIds && orgIds.length > 0) {
    repsQuery = repsQuery.in('organization_id', orgIds) as any
    teamsQuery = teamsQuery.in('organization_id', orgIds) as any
    recordsQuery = recordsQuery.in('organization_id', orgIds) as any
    schedulesQuery = schedulesQuery.in('organization_id', orgIds) as any
    plansQuery = plansQuery.in('organization_id', orgIds) as any
    contractsQuery = contractsQuery.in('organization_id', orgIds) as any
    reportsQuery = reportsQuery.in('organization_id', orgIds) as any
    orgsQuery = orgsQuery.in('id', orgIds) as any
  }

  const [
    { data: salesReps },
    { data: teams },
    { data: dailyRecords },
    { data: workSchedules },
    { data: monthlyPlans },
    { data: contracts },
    { data: dailyReports },
    { data: orgs },
  ] = await Promise.all([repsQuery, teamsQuery, recordsQuery, schedulesQuery, plansQuery, contractsQuery, reportsQuery, orgsQuery])

  const repMap: Record<string, string> = {}
  const teamMap: Record<string, string> = {}
  const orgMap: Record<string, string> = {}
  ;(salesReps || []).forEach((r: any) => { repMap[r.id] = r.name })
  ;(teams || []).forEach((t: any) => { teamMap[t.id] = t.name })
  ;(orgs || []).forEach((o: any) => { orgMap[o.id] = o.name })

  return { salesReps, teams, dailyRecords, workSchedules, monthlyPlans, contracts, dailyReports, repMap, teamMap, orgMap }
}

// 各シートのデータ行を生成
function buildRows(data: ReturnType<typeof fetchAllData> extends Promise<infer T> ? T : never) {
  const { salesReps, dailyRecords, workSchedules, monthlyPlans, contracts, dailyReports, repMap, teamMap, orgMap } = data

  // ── 担当者 ──
  const repsRows: any[][] = [['代理店', '名前', 'チーム', '表示順', '有効', '作成日']]
  for (const r of salesReps || []) {
    repsRows.push([orgMap[r.organization_id] || '', r.name, teamMap[r.team_id] || '', r.display_order, r.is_active ? '有効' : '非表示', r.created_at?.slice(0, 10)])
  }

  // ── 月間計画 ──
  const plansRows: any[][] = [['代理店', '担当者', '年月', '計画件数', '計画稼働日数', '備考', '更新日']]
  for (const r of monthlyPlans || []) {
    plansRows.push([orgMap[r.organization_id] || '', repMap[r.sales_rep_id] || r.sales_rep_id, r.year_month, r.plan_cases, r.plan_working_days, r.note || '', r.updated_at?.slice(0, 10)])
  }

  // ── 日別実績 ──
  const recordsRows: any[][] = [['代理店', '担当者', '日付', '稼働状況', '出勤状況', '稼働時間', '開始時刻', '終了時刻', '訪問', 'インターホンのみ', '対面数', '紙プレ', 'フルトーク', '宅内IN', '主権対面', '商談', '見込み', '受注', '都道府県', '市区町村', '更新日']]
  for (const r of dailyRecords || []) {
    recordsRows.push([
      orgMap[r.organization_id] || '', repMap[r.sales_rep_id] || r.sales_rep_id, r.record_date, r.work_status, r.attendance_status,
      r.working_hours, r.work_time_start, r.work_time_end,
      r.visits, r.interphone_only, r.net_meetings, r.paper_presentation, r.full_talk, r.indoor_entry,
      r.owner_meetings, r.negotiations, r.prospects, r.acquisitions,
      r.area_pref, r.area_city, r.updated_at?.slice(0, 10),
    ])
  }

  // ── シフト ──
  const schedulesRows: any[][] = [['代理店', '担当者', '日付', '稼働状況', '開始時刻', '終了時刻', '更新日']]
  for (const r of workSchedules || []) {
    schedulesRows.push([orgMap[r.organization_id] || '', repMap[r.sales_rep_id] || r.sales_rep_id, r.schedule_date, r.work_status, r.work_time_start, r.work_time_end, r.updated_at?.slice(0, 10)])
  }

  // ── 契約宅 ──
  const contractsRows: any[][] = [['代理店', '担当者', '顧客名', '電話番号', '住所', '都道府県', '市区町村', 'WiFiプロバイダ', '獲得日', '工事日', '工事連絡', 'ステータス', '備考', '作成日']]
  for (const r of contracts || []) {
    contractsRows.push([
      orgMap[r.organization_id] || '', repMap[r.sales_rep_id] || r.sales_rep_id, r.customer_name, r.phone, r.address,
      r.area_pref, r.area_city, r.wifi_provider,
      r.acquired_date, r.construction_date || '', r.construction_called ? '済' : '未',
      r.status, r.notes || '', r.created_at?.slice(0, 10),
    ])
  }

  // ── 日報 ──
  const reportsRows: any[][] = [['代理店', '担当者', '日付', '訪問', 'インターホンのみ', '対面数', '紙プレ', 'フルトーク', '宅内IN', '主権対面', '商談', '見込み', '受注', '獲得案件', '失注案件', '残稼働', '良かった点', '課題', '改善策', '学び', '感謝', '作成日']]
  for (const r of dailyReports || []) {
    reportsRows.push([
      orgMap[r.organization_id] || '', repMap[r.sales_rep_id] || r.sales_rep_id, r.report_date,
      r.visits, r.interphone_only, r.net_meetings, r.paper_presentation, r.full_talk, r.indoor_entry,
      r.owner_meetings, r.negotiations, r.prospects, r.acquisitions,
      r.acquisition_case || '', r.lost_case || '', r.remaining_work || '',
      r.good_points || '', r.issues || '', r.improvements || '', r.learnings || '', r.gratitude || '',
      r.created_at?.slice(0, 10),
    ])
  }

  return { repsRows, plansRows, recordsRows, schedulesRows, contractsRows, reportsRows }
}

// 全データを同期する
export async function syncAllToSheets(spreadsheetId: string, orgIds?: string[]) {
  const supabase = getServiceSupabase()
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const data = await fetchAllData(supabase, orgIds)
  const { repsRows, plansRows, recordsRows, schedulesRows, contractsRows, reportsRows } = buildRows(data)

  await writeSheet(sheets, spreadsheetId, '担当者', repsRows)
  await writeSheet(sheets, spreadsheetId, '月間計画', plansRows)
  await writeSheet(sheets, spreadsheetId, '日別実績', recordsRows)
  await writeSheet(sheets, spreadsheetId, 'シフト', schedulesRows)
  await writeSheet(sheets, spreadsheetId, '契約宅', contractsRows)
  await writeSheet(sheets, spreadsheetId, '日報', reportsRows)

  return {
    reps: (data.salesReps || []).length,
    records: (data.dailyRecords || []).length,
    schedules: (data.workSchedules || []).length,
    plans: (data.monthlyPlans || []).length,
    contracts: (data.contracts || []).length,
    reports: (data.dailyReports || []).length,
  }
}

// 日付スタンプ付きバックアップシートを作成する
export async function backupToSheets(spreadsheetId: string, orgIds?: string[]) {
  const supabase = getServiceSupabase()
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const data = await fetchAllData(supabase, orgIds)
  const { repsRows, plansRows, recordsRows, schedulesRows, contractsRows, reportsRows } = buildRows(data)

  // 日本時間の日付文字列 (YYYY-MM-DD)
  const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const suffix = `_${jstDate}`

  await writeBackupSheet(sheets, spreadsheetId, `担当者${suffix}`, repsRows)
  await writeBackupSheet(sheets, spreadsheetId, `月間計画${suffix}`, plansRows)
  await writeBackupSheet(sheets, spreadsheetId, `日別実績${suffix}`, recordsRows)
  await writeBackupSheet(sheets, spreadsheetId, `シフト${suffix}`, schedulesRows)
  await writeBackupSheet(sheets, spreadsheetId, `契約宅${suffix}`, contractsRows)
  await writeBackupSheet(sheets, spreadsheetId, `日報${suffix}`, reportsRows)

  return {
    date: jstDate,
    reps: (data.salesReps || []).length,
    records: (data.dailyRecords || []).length,
    schedules: (data.workSchedules || []).length,
    plans: (data.monthlyPlans || []).length,
    contracts: (data.contracts || []).length,
    reports: (data.dailyReports || []).length,
  }
}
