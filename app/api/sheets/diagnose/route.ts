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

    const tabTitles = new Set(tabs.map((t: any) => t.title))
    const repNames = (reps ?? []).map((r: any) => r.name)
    const matched = repNames.filter((n: string) => tabTitles.has(n))
    const unmatched = repNames.filter((n: string) => !tabTitles.has(n))

    return NextResponse.json({
      spreadsheet_tabs: tabs.map((t: any) => `${t.title} (gid:${t.gid})`),
      db_rep_names: repNames,
      matched_tabs: matched,
      unmatched_reps: unmatched,
      summary: `${matched.length}/${repNames.length}名のタブが一致`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
