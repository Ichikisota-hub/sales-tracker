import { NextRequest, NextResponse } from 'next/server'

const SHEET_ID = '1g5TNx75jUVAdqRVpKXxng1UQoAtzPmj5kAidaoA_c-8'
// 既存の /api/schedule と同じシートを使用
const SHEET_NAMES = ['月間表', 'Sheet1', 'シフト']

function normalize(s: string) {
  return s.replace(/[\s　]/g, '')
}

function padTime(t: string): string {
  const [h, m] = t.split(':')
  return `${String(parseInt(h)).padStart(2, '0')}:${String(parseInt(m)).padStart(2, '0')}`
}

// "3/1 09:00-21:00", "フル", "13.00-20.30", "13:00-" などをパース
function parseTime(cell: string): { start: string; end: string } | null {
  if (!cell?.trim()) return null
  const v = cell.trim()

  if (v.includes('フル')) return { start: '09:00', end: '21:00' }

  // ドットをコロンに正規化: 13.00 → 13:00
  const n = v.replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')

  // 範囲指定: HH:MM-HH:MM または HH:MM〜HH:MM
  const fullMatch = n.match(/(\d{1,2}:\d{2})\s*[-〜]\s*(\d{1,2}:\d{2})/)
  if (fullMatch) return { start: padTime(fullMatch[1]), end: padTime(fullMatch[2]) }

  // 開始のみ
  const startMatch = n.match(/(\d{1,2}:\d{2})/)
  if (startMatch) return { start: padTime(startMatch[1]), end: '' }

  return null
}

async function fetchSheet(apiKey: string, sheetName: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`
  )
  if (!res.ok) return null
  const json = await res.json()
  return (json.values || []) as string[][]
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_SHEETS_API_KEY not set' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('yearMonth')
  const repName = searchParams.get('repName')
  if (!yearMonth || !repName) {
    return NextResponse.json({ error: 'yearMonth and repName required' }, { status: 400 })
  }

  const [year, month] = yearMonth.split('-').map(Number)

  // シート名を順番に試す
  let rows: string[][] | null = null
  for (const name of SHEET_NAMES) {
    rows = await fetchSheet(apiKey, name)
    if (rows && rows.length >= 2) break
  }

  if (!rows || rows.length < 2) {
    return NextResponse.json({ error: 'シートが見つかりませんでした', times: {} }, { status: 200 })
  }

  // ヘッダー行から列→日付マッピング
  const headers = rows[0]
  const colToDate: Record<number, string> = {}
  for (let col = 1; col < headers.length; col++) {
    const match = headers[col]?.trim().match(/^(\d+)\/(\d+)/)
    if (!match) continue
    if (parseInt(match[1]) === month) {
      colToDate[col] = `${year}-${String(month).padStart(2, '0')}-${String(parseInt(match[2])).padStart(2, '0')}`
    }
  }

  // 担当者の行を探す
  let personRow: string[] | null = null
  for (let row = 1; row < rows.length; row++) {
    const name = rows[row][0]?.trim()
    if (!name) continue
    if (
      normalize(name) === normalize(repName) ||
      normalize(name).includes(normalize(repName)) ||
      normalize(repName).includes(normalize(name))
    ) {
      personRow = rows[row]
      break
    }
  }

  if (!personRow) {
    return NextResponse.json({ times: {}, notFound: true })
  }

  // 日付 → 時間マップを構築
  const times: Record<string, { start: string; end: string }> = {}
  for (const [colStr, dateStr] of Object.entries(colToDate)) {
    const cell = personRow[Number(colStr)] || ''
    const parsed = parseTime(cell)
    if (parsed) times[dateStr] = parsed
  }

  return NextResponse.json({ times })
}
