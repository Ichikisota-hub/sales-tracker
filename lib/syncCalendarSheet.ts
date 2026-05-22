/**
 * カレンダー形式スプレッドシート同期
 * daily_records の INSERT/UPDATE 時に自動呼び出しされる
 */
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']
const GREEN  = { red: 0.16, green: 0.38, blue: 0.16 }
const YELLOW = { red: 1.0,  green: 0.95, blue: 0.2  }
const ORANGE = { red: 1.0,  green: 0.8,  blue: 0.0  }
const BLUE_L = { red: 0.78, green: 0.89, blue: 0.97 }
const RED_L  = { red: 1.0,  green: 0.85, blue: 0.85 }
const GRAY   = { red: 0.93, green: 0.93, blue: 0.93 }
const WHITE  = { red: 1.0,  green: 1.0,  blue: 1.0  }

const COL_HEADERS = ['日','曜','計画件数','獲得件数','出勤状態','訪問','対面','主権対面','商談','獲得','稼働地域①','稼働地域②']
const CAT_ROW     = ['','','既存','','','メニュー','','','','','稼働地','']
const N_COLS = 12

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません')
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(keyJson),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function weekdayStr(year: number, month: number, day: number) {
  return WEEKDAYS[new Date(year, month - 1, day).getDay() === 0 ? 6 : new Date(year, month - 1, day).getDay() - 1]
}

function cellFmt(sid: number, rs: number, re: number, cs: number, ce: number, opts: {
  bg?: any; bold?: boolean; fg?: any; center?: boolean; wrap?: boolean
}) {
  const fmt: any = {}
  if (opts.bg)     fmt.backgroundColor   = opts.bg
  if (opts.bold || opts.fg) fmt.textFormat = { ...(opts.bold ? { bold: true } : {}), ...(opts.fg ? { foregroundColor: opts.fg } : {}) }
  if (opts.center) fmt.horizontalAlignment = 'CENTER'
  if (opts.wrap)   fmt.wrapStrategy = 'WRAP'
  return { repeatCell: { range: { sheetId: sid, startRowIndex: rs, endRowIndex: re, startColumnIndex: cs, endColumnIndex: ce },
    cell: { userEnteredFormat: fmt }, fields: 'userEnteredFormat' } }
}

export async function syncCalendarSheet(spreadsheetId?: string): Promise<void> {
  const ssId = spreadsheetId || process.env.GOOGLE_SHEET_ID
  if (!ssId) throw new Error('GOOGLE_SHEET_ID が設定されていません')

  const supabase = getSupabase()
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // 現在月を対象とする
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  const totalDays = daysInMonth(year, month)
  const monthLabel = `${year}年${month}月`

  // データ取得
  const [{ data: reps }, { data: records }, { data: plans }] = await Promise.all([
    supabase.from('sales_reps').select('id,name,display_order').order('display_order'),
    supabase.from('daily_records')
      .select('sales_rep_id,record_date,visits,net_meetings,owner_meetings,negotiations,acquisitions,acquired_cases,work_status,area_pref,area_city')
      .gte('record_date', `${yearMonth}-01`)
      .lte('record_date', `${yearMonth}-${String(totalDays).padStart(2, '0')}`),
    supabase.from('monthly_plans').select('sales_rep_id,year_month,plan_cases').eq('year_month', yearMonth),
  ])

  if (!reps?.length) return

  // ルックアップ
  const sortedReps = [...reps].sort((a, b) => a.display_order - b.display_order)
  const recMap = new Map<string, any>()
  for (const r of records ?? []) {
    recMap.set(`${r.record_date}|${r.sales_rep_id}`, r)
  }
  const planMap = new Map<string, number>()
  for (const p of plans ?? []) {
    planMap.set(p.sales_rep_id, p.plan_cases ?? 0)
  }

  // 当月データがある担当者
  const activeReps = sortedReps.filter(r =>
    Array.from({ length: totalDays }, (_, i) => i + 1).some(d =>
      recMap.has(`${yearMonth}-${String(d).padStart(2, '0')}|${r.id}`)
    )
  )
  if (!activeReps.length) return

  // 既存シート情報取得
  const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId })
  const existingSheets = new Map<string, number>(
    (meta.data.sheets ?? []).map((s: any) => [s.properties.title, s.properties.sheetId])
  )

  const sheetTitles = [monthLabel + '_サマリー', ...activeReps.map(r => r.name)]
  const delReqs = sheetTitles.filter(t => existingSheets.has(t)).map(t => ({ deleteSheet: { sheetId: existingSheets.get(t)! } }))
  const addReqs = sheetTitles.map((t, i) => ({ addSheet: { properties: { title: t, index: i } } }))

  const batchRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ssId,
    requestBody: { requests: [...delReqs, ...addReqs] },
  })

  // 新シートIDマップ
  const sidMap = new Map<string, number>()
  const meta2 = await sheets.spreadsheets.get({ spreadsheetId: ssId })
  for (const s of meta2.data.sheets ?? []) {
    sidMap.set(s.properties!.title!, s.properties!.sheetId!)
  }

  const valueData: any[] = []
  const fmtReqs: any[] = []

  // ── 個人シート ──
  for (const rep of activeReps) {
    const rid = rep.id
    const sid = sidMap.get(rep.name)!
    const planCases = planMap.get(rid) ?? 0
    const dataRows: any[][] = []
    const totals = [0, 0, 0, 0, 0, 0]

    for (let day = 1; day <= totalDays; day++) {
      const dStr = `${yearMonth}-${String(day).padStart(2, '0')}`
      const rec = recMap.get(`${dStr}|${rid}`)
      const v  = rec?.visits ?? 0
      const nm = rec?.net_meetings ?? 0
      const om = rec?.owner_meetings ?? 0
      const ng = rec?.negotiations ?? 0
      const aq = rec?.acquisitions ?? 0
      const ac = rec?.acquired_cases ?? 0
      const ws = rec?.work_status ?? ''
      const a1 = rec?.area_pref ?? ''
      const a2 = rec?.area_city ?? ''

      dataRows.push([day, weekdayStr(year, month, day), day === 1 ? planCases : '', ac, ws, v, nm, om, ng, aq, a1, a2])
      totals[0] += ac; totals[1] += v; totals[2] += nm; totals[3] += om; totals[4] += ng; totals[5] += aq
    }

    const totalRow = ['合計', '', '', totals[0], '', totals[1], totals[2], totals[3], totals[4], totals[5], '', '']
    const sheetData = [[rep.name, ...Array(N_COLS - 1).fill('')], CAT_ROW, COL_HEADERS, ...dataRows, totalRow]

    valueData.push({ range: `'${rep.name}'!A1`, values: sheetData })

    const n = sheetData.length
    fmtReqs.push(
      cellFmt(sid, 0, 1, 0, N_COLS, { bold: true }),
      cellFmt(sid, 1, 2, 2, 5,  { bg: GREEN,  bold: true, fg: WHITE, center: true }),
      cellFmt(sid, 1, 2, 5, 10, { bg: YELLOW, bold: true, center: true }),
      cellFmt(sid, 1, 2, 10, 12,{ bg: ORANGE, bold: true, center: true }),
      cellFmt(sid, 2, 3, 0, N_COLS, { bg: GRAY, bold: true, center: true, wrap: true }),
      cellFmt(sid, n - 1, n, 0, N_COLS, { bold: true, bg: { red: 0.95, green: 0.95, blue: 0.95 } }),
    )

    for (let day = 1; day <= totalDays; day++) {
      const ri = day + 2
      const wd = new Date(year, month - 1, day).getDay()
      if (wd === 6) fmtReqs.push(cellFmt(sid, ri, ri + 1, 0, N_COLS, { bg: BLUE_L }))
      else if (wd === 0) fmtReqs.push(cellFmt(sid, ri, ri + 1, 0, N_COLS, { bg: RED_L }))
    }

    const colWidths = [35,35,60,60,75,55,55,65,55,55,80,80]
    colWidths.forEach((w, ci) => fmtReqs.push({
      updateDimensionProperties: {
        range: { sheetId: sid, dimension: 'COLUMNS', startIndex: ci, endIndex: ci + 1 },
        properties: { pixelSize: w }, fields: 'pixelSize',
      }
    }))

    for (const [cs, ce] of [[2,5],[5,10],[10,12]] as [number,number][]) {
      fmtReqs.push({ mergeCells: { range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2, startColumnIndex: cs, endColumnIndex: ce }, mergeType: 'MERGE_ALL' } })
    }
  }

  // ── サマリーシート ──
  const sumTitle = monthLabel + '_サマリー'
  const sumSid = sidMap.get(sumTitle)!
  const sumHdr = [['担当者','訪問','対面','主権対面','商談','獲得','獲得件数','稼働日数','訪問/日','獲得率(%)']]
  const sumRows: any[][] = activeReps.map(rep => {
    let sv=0,sn=0,so=0,sg=0,sa=0,sac=0,sd=0
    for (let d = 1; d <= totalDays; d++) {
      const rec = recMap.get(`${yearMonth}-${String(d).padStart(2,'0')}|${rep.id}`)
      if (rec) {
        sv+=rec.visits??0; sn+=rec.net_meetings??0; so+=rec.owner_meetings??0
        sg+=rec.negotiations??0; sa+=rec.acquisitions??0; sac+=rec.acquired_cases??0
        if (rec.work_status==='稼働') sd++
      }
    }
    return [rep.name, sv, sn, so, sg, sa, sac, sd, sv?(sv/(sd||1)).toFixed(1):0, sv?(sa/sv*100).toFixed(1):0]
  })
  sumRows.push(['合計', ...[1,2,3,4,5,6,7].map(i => sumRows.reduce((a, r) => a + (Number(r[i])||0), 0)), '', ''])

  valueData.push({ range: `'${sumTitle}'!A1`, values: [...sumHdr, ...sumRows] })
  fmtReqs.push(
    cellFmt(sumSid, 0, 1, 0, 10, { bg: GREEN, bold: true, fg: WHITE }),
    cellFmt(sumSid, sumHdr.length + sumRows.length - 1, sumHdr.length + sumRows.length, 0, 10, { bold: true, bg: GRAY }),
  )

  // ── 一括書き込み・書式 ──
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: ssId,
    requestBody: { valueInputOption: 'RAW', data: valueData },
  })
  for (let i = 0; i < fmtReqs.length; i += 100) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ssId,
      requestBody: { requests: fmtReqs.slice(i, i + 100) },
    })
  }
}
