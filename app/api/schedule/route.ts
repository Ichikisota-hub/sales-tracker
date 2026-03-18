import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase-server'

const DEFAULT_SHEET_ID = process.env.GOOGLE_SHEET_ID || ''
const SHEET_NAME = '月間表'

async function getSheetId(): Promise<string> {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return DEFAULT_SHEET_ID

    const { data: member } = await supabase
      .from('organization_members')
      .select('organizations(settings)')
      .eq('user_id', user.id)
      .single()

    const sheetId = (member as any)?.organizations?.settings?.google_sheet_id
    return sheetId || DEFAULT_SHEET_ID
  } catch {
    return DEFAULT_SHEET_ID
  }
}

// 担当者名 → 稼働日付Set のマップを返す
// { "市来颯太": Set(["2025-03-01", "2025-03-02", ...]), ... }
export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_SHEETS_API_KEY not set' }, { status: 500 })
  }

  const SHEET_ID = await getSheetId()
  if (!SHEET_ID) {
    return NextResponse.json({ error: 'スプレッドシートIDが設定されていません' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get('yearMonth') // "2025-03"

  if (!yearMonth) {
    return NextResponse.json({ error: 'yearMonth required' }, { status: 400 })
  }

  const [year, month] = yearMonth.split('-').map(Number)

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const json = await res.json()
    const rows: string[][] = json.values || []

    if (rows.length < 2) {
      return NextResponse.json({ schedule: {} })
    }

    // 1行目: ["名前", "3/1", "3/2", ...]
    const headers = rows[0]

    // ヘッダー列インデックスを日付文字列にマップ
    // "3/1" → "2025-03-01" のように変換
    const colToDate: Record<number, string> = {}
    for (let col = 1; col < headers.length; col++) {
      const header = headers[col]?.trim()
      if (!header) continue
      // "3/1" or "3/1\n何か" の形式
      const match = header.match(/^(\d+)\/(\d+)/)
      if (!match) continue
      const m = parseInt(match[1])
      const d = parseInt(match[2])
      if (m === month) {
        const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        colToDate[col] = dateStr
      }
    }

    // 2行目以降: 担当者ごとの稼働日をセット
    const schedule: Record<string, string[]> = {}
    for (let row = 1; row < rows.length; row++) {
      const name = rows[row][0]?.trim()
      if (!name) continue
      const workingDays: string[] = []
      for (const [colStr, dateStr] of Object.entries(colToDate)) {
        const col = Number(colStr)
        const cell = rows[row][col]?.trim() ?? ''
        if (cell !== '') {
          workingDays.push(dateStr)
        }
      }
      schedule[name] = workingDays
    }

    return NextResponse.json({ schedule })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
