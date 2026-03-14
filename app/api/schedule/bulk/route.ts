import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SHEET_ID = '1g5TNx75jUVAdqRVpKXxng1UQoAtzPmj5kAidaoA_c-8'
const SHEET_NAME = '月間表'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalize(s: string) {
  return s.replace(/[\s　]/g, '')
}

function matchName(repName: string, sheetNames: string[]): string | null {
  return (
    sheetNames.find(k => k === repName) ||
    sheetNames.find(k => normalize(k) === normalize(repName)) ||
    sheetNames.find(k => normalize(k).includes(normalize(repName)) || normalize(repName).includes(normalize(k))) ||
    null
  )
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_SHEETS_API_KEY not set' }, { status: 500 })

  const { yearMonth } = await req.json()
  if (!yearMonth) return NextResponse.json({ error: 'yearMonth required' }, { status: 400 })

  const [year, month] = yearMonth.split('-').map(Number)

  // スプレッドシートを取得
  const sheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${apiKey}`
  )
  if (!sheetRes.ok) return NextResponse.json({ error: await sheetRes.text() }, { status: sheetRes.status })

  const sheetJson = await sheetRes.json()
  const rows: string[][] = sheetJson.values || []
  if (rows.length < 2) return NextResponse.json({ error: 'シートにデータがありません' }, { status: 400 })

  // ヘッダー行から日付マッピング
  const headers = rows[0]
  const colToDate: Record<number, string> = {}
  for (let col = 1; col < headers.length; col++) {
    const match = headers[col]?.trim().match(/^(\d+)\/(\d+)/)
    if (!match) continue
    if (parseInt(match[1]) === month) {
      colToDate[col] = `${year}-${String(month).padStart(2, '0')}-${String(parseInt(match[2])).padStart(2, '0')}`
    }
  }

  // シートの担当者名 → 稼働日リスト
  const sheetSchedule: Record<string, string[]> = {}
  const sheetNames: string[] = []
  for (let row = 1; row < rows.length; row++) {
    const name = rows[row][0]?.trim()
    if (!name) continue
    sheetNames.push(name)
    const workingDays: string[] = []
    for (const [colStr, dateStr] of Object.entries(colToDate)) {
      if ((rows[row][Number(colStr)]?.trim() ?? '') !== '') workingDays.push(dateStr)
    }
    sheetSchedule[name] = workingDays
  }

  // Supabaseから担当者一覧を取得
  const { data: reps } = await supabase.from('sales_reps').select('id,name').order('display_order')
  if (!reps) return NextResponse.json({ error: 'reps取得失敗' }, { status: 500 })

  // 月の全日付を生成
  const daysInMonth: string[] = Object.values(colToDate).sort()

  const results: { name: string; matched: string | null; days: number; status: string }[] = []
  const upsertRows: object[] = []

  for (const rep of reps) {
    if (!rep.name || rep.name.startsWith('担当者')) continue
    const matchedKey = matchName(rep.name, sheetNames)
    if (!matchedKey) {
      results.push({ name: rep.name, matched: null, days: 0, status: 'not_found' })
      continue
    }
    const workingSet = new Set(sheetSchedule[matchedKey] || [])
    for (const dateStr of daysInMonth) {
      upsertRows.push({
        sales_rep_id: rep.id,
        schedule_date: dateStr,
        work_status: workingSet.has(dateStr) ? '稼働' : '休日',
        updated_at: new Date().toISOString(),
      })
    }
    results.push({ name: rep.name, matched: matchedKey, days: workingSet.size, status: 'ok' })
  }

  if (upsertRows.length > 0) {
    const { error } = await supabase.from('work_schedules').upsert(upsertRows, { onConflict: 'sales_rep_id,schedule_date' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results, saved: upsertRows.length })
}
