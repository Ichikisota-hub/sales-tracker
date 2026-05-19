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

// スプレッドシートの全シート一覧を取得（gid → title マップも返す）
async function getSheetsMeta(sheets: any, spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const list: { gid: number; title: string }[] = (meta.data.sheets ?? []).map((s: any) => ({
    gid: s.properties?.sheetId,
    title: s.properties?.title,
  }))
  return list
}

// シートが存在しなければ作成し、sheetIdを返す
// targetGid が指定されている場合は、そのgidのシートに書き込む（名前変更なし）
async function ensureSheet(
  sheets: any,
  spreadsheetId: string,
  sheetTitle: string,
  targetGid?: number,
  metaList?: { gid: number; title: string }[]
): Promise<number> {
  const list = metaList ?? await getSheetsMeta(sheets, spreadsheetId)

  // gid 直指定の場合はそのシートを使う
  if (targetGid !== undefined) {
    const byGid = list.find(s => s.gid === targetGid)
    if (byGid) return byGid.gid
  }

  // タイトル一致を探す
  const byTitle = list.find(s => s.title === sheetTitle)
  if (byTitle) return byTitle.gid

  // 存在しないので新規作成
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetTitle } } }],
    },
  })
  return res.data.replies![0].addSheet!.properties!.sheetId!
}

// ヘッダー行を太字にする（結合セルがあるシートでもエラーにならないよう分割実行）
async function formatHeaderAndFilter(
  sheets: any,
  spreadsheetId: string,
  sheetId: number,
  colCount: number,
  skipFilter = false
) {
  // ①ヘッダー書式 + 行固定
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

  // ②オートフィルター（結合セルがあると失敗するので別リクエストでtry/catch）
  if (!skipFilter) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            setBasicFilter: {
              filter: {
                range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: colCount },
              },
            },
          }],
        },
      })
    } catch {
      // 結合セルがある場合はフィルター設定をスキップ（データ書き込みは完了済み）
    }
  }
}

// 1シートを全クリア → データ書き込み（新規シート用）
async function writeSheet(sheets: any, spreadsheetId: string, sheetTitle: string, rows: any[][]) {
  const sheetId = await ensureSheet(sheets, spreadsheetId, sheetTitle)
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetTitle}!A:ZZ` })
  if (rows.length === 0) return
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })
  await formatHeaderAndFilter(sheets, spreadsheetId, sheetId, rows[0].length)
}

// 既存テンプレートシートにデータだけ流し込む
// - ヘッダー行を読み取って列の順番を把握
// - ヘッダーは一切上書きしない（書式・結合セルを保持）
// - データは headerRow+1 行目からのみ書き込む
// - 古いデータ行だけクリアしてから書き直す
async function writeToExistingTemplate(
  sheets: any,
  spreadsheetId: string,
  sheetTitle: string,
  dataRows: any[][], // ヘッダーなし・データ行のみ
  headerRow: number = 1, // ヘッダーが何行目か（1始まり）
) {
  if (dataRows.length === 0) return

  const dataStartRow = headerRow + 1 // データ書き込み開始行（1始まり）
  const dataRange = `${sheetTitle}!A${dataStartRow}:ZZ`

  // データ行だけクリア（ヘッダーは触らない）
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: dataRange })

  // データを書き込む
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A${dataStartRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: dataRows },
  })
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

  // ── 人別日次集計（スプレッドシートの主要集計シート） ──
  // 列: 代理店|担当者|日付|計画件数|獲得件数|出勤状態|訪問|対面|主権対面|商談|獲得|稼働地域①|獲得件数①|稼働地域②|獲得件数②|稼働地域③|獲得件数③
  const personalDailyHeader = [
    '代理店', '担当者', '日付',
    '計画\n件数', '獲得\n件数', '出勤\n状態',
    '訪問', '対面', '主権対面', '商談', '獲得',
    '稼働地域①', '獲得件数①',
    '稼働地域②', '獲得件数②',
    '稼働地域③', '獲得件数③',
  ]

  // 月間計画マップ: sales_rep_id → { year_month → plan_cases }
  const planMap: Record<string, Record<string, number>> = {}
  for (const p of monthlyPlans || []) {
    if (!planMap[p.sales_rep_id]) planMap[p.sales_rep_id] = {}
    planMap[p.sales_rep_id][p.year_month] = p.plan_cases
  }

  const personalDailyRows: any[][] = [personalDailyHeader]

  for (const r of dailyRecords || []) {
    const yearMonth = r.record_date?.slice(0, 7)
    const planCases = planMap[r.sales_rep_id]?.[yearMonth] ?? ''

    // area_list（複数エリア）から最大3件取得
    const areaList: { pref?: string; city?: string }[] = Array.isArray(r.area_list)
      ? r.area_list
      : []
    // area_listが空なら area_pref/area_city を①に使う
    const resolvedAreas = areaList.length > 0
      ? areaList
      : (r.area_pref ? [{ pref: r.area_pref, city: r.area_city }] : [])

    const areaLabel = (idx: number) => {
      const a = resolvedAreas[idx]
      if (!a) return ''
      return [a.pref, a.city].filter(Boolean).join(' ')
    }

    // 獲得件数①: 記録されたエリアが1つだけなら全件数を①に、複数エリアは各エリア均等分割（端数は①に集約）
    const totalAcq = Number(r.acquisitions) || 0
    const areaCount = Math.max(resolvedAreas.length, 1)
    const baseAcq = Math.floor(totalAcq / areaCount)
    const remainder = totalAcq - baseAcq * areaCount
    const acq1 = resolvedAreas.length > 0 ? baseAcq + remainder : totalAcq
    const acq2 = resolvedAreas.length >= 2 ? baseAcq : ''
    const acq3 = resolvedAreas.length >= 3 ? baseAcq : ''

    personalDailyRows.push([
      orgMap[r.organization_id] || '',
      repMap[r.sales_rep_id] || r.sales_rep_id,
      r.record_date,
      planCases,
      totalAcq,
      r.attendance_status || r.work_status || '',
      r.visits || 0,
      r.net_meetings || 0,
      r.owner_meetings || 0,
      r.negotiations || 0,
      r.acquisitions || 0,
      areaLabel(0), acq1,
      areaLabel(1), acq2,
      areaLabel(2), acq3,
    ])
  }

  return { repsRows, plansRows, recordsRows, schedulesRows, contractsRows, reportsRows, personalDailyRows }
}

// 列名の正規化（改行・スペース除去）
function normalizeHeader(h: string): string {
  return h.replace(/\n/g, '').replace(/\s+/g, '').trim()
}

// 担当者タブへの日別データ書き込み
// 構造: 行1=名前, 行2=セクション, 行3=列ヘッダー, 行4〜34=日別データ, 行35=TTL(数式)
async function syncRepToPersonalSheet(
  sheets: any,
  spreadsheetId: string,
  sheetTitle: string,
  repRecords: any[],  // この担当者の daily_records
  planCases: number,
  yearMonth: string,
) {
  const HEADER_ROW = 3           // 列ヘッダー行（1始まり）
  const DATA_START_ROW = 4       // データ開始行
  const DAYS_IN_COL_A = true     // A列=日番号, B列=曜日

  const [y, m] = yearMonth.split('-').map(Number)
  const totalDays = new Date(y, m, 0).getDate()

  // 列ヘッダーを読み取る（行3）
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A${HEADER_ROW}:ZZ${HEADER_ROW}`,
  })
  const headers: string[] = (headerRes.data.values?.[0] ?? []).map((h: any) => normalizeHeader(String(h)))

  // 日付 → レコードのマップ
  const byDay: Record<number, any> = {}
  for (const r of repRecords) {
    const day = parseInt(r.record_date.slice(-2), 10)
    byDay[day] = r
  }

  // area_list から地域名を取得
  function getArea(r: any, idx: number): string {
    const list: { pref?: string; city?: string }[] = Array.isArray(r.area_list) ? r.area_list : []
    const a = list[idx] || (idx === 0 && r.area_pref ? { pref: r.area_pref, city: r.area_city } : null)
    if (!a) return ''
    return [a.pref, a.city].filter(Boolean).join(' ')
  }

  // 列ヘッダーと値のマッピング
  function getValueForHeader(key: string, r: any | null, day: number): any {
    if (!key) return ''
    // A列=日番号, B列=曜日 は書き込まない（既存の値を保持）
    if (key === '' && headers.indexOf(key) <= 1) return null // skip

    if (!r) return ''
    switch (key) {
      case '計画件数': return planCases || ''
      case '獲得件数': return r.acquisitions ?? 0
      case '出勤状態': return r.attendance_status || r.work_status || ''
      case '訪問': return r.visits ?? 0
      case '対面': return r.net_meetings ?? 0
      case '主権対面': return r.owner_meetings ?? 0
      case '商談': return r.negotiations ?? 0
      case '獲得': return r.acquisitions ?? 0
      // 商材別は未対応（空白）
      case 'マンション': case 'ホーム': case 'S-SAFE':
      case '安心サポート': case '住まいと暮らしの相談':
      case 'BenefitStation': case '詐欺ウォール': case '備えて安心データ復旧':
        return ''
      case '稼働地域①': return getArea(r, 0)
      case '獲得件数①': return r.acquisitions ?? 0
      case '稼働地域②': return getArea(r, 1)
      case '獲得件数②': return ''
      case '稼働地域③': return getArea(r, 2)
      case '獲得件数③': return ''
      default: return ''
    }
  }

  // 31日分のデータ行を生成（A列・B列はスキップ、C列以降のみ）
  // A列=日番号・B列=曜日は既存の値を保持するため、C列から書き込む
  const dataColStart = DAYS_IN_COL_A ? 2 : 0  // 0始まりインデックスでC列=2
  const dataHeaders = headers.slice(dataColStart)
  const startColLetter = columnIndexToLetter(dataColStart) // 'C'

  const rows: any[][] = []
  for (let day = 1; day <= 31; day++) {
    const r = day <= totalDays ? byDay[day] || null : null
    const rowData = dataHeaders.map((key, i) => {
      return getValueForHeader(key, r, day)
    })
    rows.push(rowData)
  }

  // データ行のみクリアしてから書き込む（TTL行=35行目は触れない）
  const clearRange = `${sheetTitle}!${startColLetter}${DATA_START_ROW}:ZZ${DATA_START_ROW + 30}`
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: clearRange })

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!${startColLetter}${DATA_START_ROW}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })
}

// 列インデックス(0始まり)をA,B,C...表記に変換
function columnIndexToLetter(index: number): string {
  let letter = ''
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

// 全データを同期する
export async function syncAllToSheets(spreadsheetId: string, orgIds?: string[]) {
  const supabase = getServiceSupabase()
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const metaList = await getSheetsMeta(sheets, spreadsheetId)
  const sheetNames = new Set(metaList.map(s => s.title))

  const data = await fetchAllData(supabase, orgIds)
  const { repsRows, plansRows, recordsRows, schedulesRows, contractsRows, reportsRows } = buildRows(data)

  // 現在の年月を取得（JST）
  const jstNow = new Date(Date.now() + 9 * 3600_000)
  const yearMonth = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}`

  // 月間計画マップ
  const planMap: Record<string, number> = {}
  for (const p of (data.monthlyPlans ?? [])) {
    if (p.year_month === yearMonth) planMap[p.sales_rep_id] = p.plan_cases
  }

  // 既存タブにのみ書き込む（新規タブは一切作成しない）
  let syncedReps = 0
  const skippedReps: string[] = []

  for (const rep of (data.salesReps ?? [])) {
    if (!sheetNames.has(rep.name)) {
      skippedReps.push(rep.name) // タブが存在しない → スキップ
      continue
    }

    const repRecords = (data.dailyRecords ?? []).filter(
      (r: any) => r.sales_rep_id === rep.id && r.record_date.startsWith(yearMonth)
    )
    const planCases = planMap[rep.id] ?? 0

    await syncRepToPersonalSheet(sheets, spreadsheetId, rep.name, repRecords, planCases, yearMonth)
    syncedReps++
  }

  return {
    synced_reps: syncedReps,
    skipped_reps: skippedReps,
    records: (data.dailyRecords || []).length,
  }
}

// 日付スタンプ付きバックアップシートを作成する
export async function backupToSheets(spreadsheetId: string, orgIds?: string[]) {
  const supabase = getServiceSupabase()
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const data = await fetchAllData(supabase, orgIds)
  const { repsRows, plansRows, recordsRows, schedulesRows, contractsRows, reportsRows, personalDailyRows } = buildRows(data)

  // 日本時間の日付文字列 (YYYY-MM-DD)
  const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const suffix = `_${jstDate}`

  await writeBackupSheet(sheets, spreadsheetId, `人別日次集計${suffix}`, personalDailyRows)
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
