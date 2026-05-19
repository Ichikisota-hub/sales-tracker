import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

function getAuth() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const spreadsheetId = searchParams.get('id')
  if (!spreadsheetId) return NextResponse.json({ error: 'id パラメータが必要です' }, { status: 400 })

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: reps } = await supabase
      .from('sales_reps').select('id,name').eq('is_active', true).order('display_order')

    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const tabs = (meta.data.sheets ?? []).map((s: any) => ({
      gid: s.properties?.sheetId,
      title: s.properties?.title,
    }))

    const strip = (s: string) => s.replace(/[\s　]/g, '')
    // スペース正規化マップ
    const normalizedMap = new Map<string, string>()
    for (const t of tabs) normalizedMap.set(strip(t.title), t.title)

    const repNames = (reps ?? []).map((r: any) => r.name)
    const matched: { db: string; tab: string }[] = []
    const unmatched: string[] = []
    const needsRename: { db: string; tab: string }[] = []

    for (const name of repNames) {
      const exactMatch = tabs.find((t: any) => t.title === name)
      if (exactMatch) {
        matched.push({ db: name, tab: name })
        continue
      }
      const fuzzyMatch = normalizedMap.get(strip(name))
      if (fuzzyMatch) {
        matched.push({ db: name, tab: `${fuzzyMatch} ※スペース差あり` })
        needsRename.push({ db: name, tab: fuzzyMatch })
        continue
      }
      unmatched.push(name)
    }

    // タブはあるがDB未登録
    const dbNamesStripped = new Set(repNames.map((n: string) => strip(n)))
    const tabsNotInDB = tabs
      .filter((t: any) => !['祝日リスト','単日'].includes(t.title) && !dbNamesStripped.has(strip(t.title)))
      .map((t: any) => t.title)

    // マッチした担当者の行3ヘッダーも確認
    const headerSamples: Record<string, string[]> = {}
    for (const m of matched.slice(0, 2)) {
      const tabTitle = m.tab.replace(' ※スペース差あり', '')
      try {
        const hr = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `${tabTitle}!A1:ZZ6`,
        })
        const rows = hr.data.values ?? []
        headerSamples[tabTitle] = rows.map((row: any[], rowIdx: number) =>
          `row${rowIdx + 1}: [${row.map((v: any) => String(v).replace(/\n/g, '\\n').slice(0, 20)).join(' | ')}]`
        )
      } catch {}
    }

    return NextResponse.json({
      summary: `${matched.length}/${repNames.length}名が一致（スペース差含む）`,
      matched,
      unmatched_reps: unmatched,
      tabs_not_in_db: tabsNotInDB,
      needs_rename: needsRename,
      header_samples: headerSamples,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
