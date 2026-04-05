import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase-server'

const TARGET_GID = 1026668186
const CONTRACT_SPREADSHEET_ID = '1I5Wpmd34kQaiS1Cm82WRb5wKjhT-5jc4CeLESaLJ6w0'

// 列インデックス（0始まり）
const COL = {
  acquired_date:     0,   // 獲得日
  rep_name:          2,   // クローザー
  sei:               7,   // 姓
  mei:               8,   // 名
  phone:             9,   // ＴＥＬ
  postal:           10,   // 郵便番号
  area_pref:        11,   // 都道府県
  area_city:        12,   // 市町村
  banchi:           13,   // 番地
  building:         14,   // 建物名
  room:             15,   // 部屋番号
  wifi_provider:    17,   // 既存回線
  construction_date:37,   // 工事日
  open_date:        38,   // 開通日
  status:           39,   // ステータス
  notes:            44,   // 備考
  special_notes:    45,   // 特記事項
}

async function getSheetId(): Promise<string> {
  try {
    const supabase = await createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return process.env.GOOGLE_SHEET_ID || ''
    const { data: member } = await supabase
      .from('organization_members')
      .select('organizations(settings)')
      .eq('user_id', session.user.id)
      .single()
    const sheetId = (member as any)?.organizations?.settings?.google_sheet_id
    return sheetId || process.env.GOOGLE_SHEET_ID || ''
  } catch {
    return process.env.GOOGLE_SHEET_ID || ''
  }
}

async function getSheetName(spreadsheetId: string, apiKey: string): Promise<string | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${apiKey}&fields=sheets.properties`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  const sheet = (json.sheets || []).find((s: any) => s.properties?.sheetId === TARGET_GID)
  return sheet?.properties?.title || null
}

function cell(row: string[], idx: number): string {
  return (row[idx] || '').trim()
}

// 全角数字・ハイフンを半角に正規化して電話番号を整形
function normalizePhone(s: string): string {
  return s
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[－ー−]/g, '-')
    .trim()
}

// 日付文字列を YYYY-MM-DD に変換
// 入力例: "2026/4/5", "2026-04-05", "4/5", "令和8年4月5日"
function parseDate(val: string): string | null {
  if (!val) return null
  const s = val.trim()

  // YYYY/MM/DD or YYYY-MM-DD
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`

  // M/D or MM/DD → 今年
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (m) {
    const y = new Date().getFullYear()
    return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  }

  return null
}

// スプレッドシートのステータス → アプリ内ステータスに変換
function normalizeStatus(val: string): string {
  const v = val.trim()
  // アプリ内のステータスとそのまま一致
  if (['手続き中', '工事日決定', '開通', 'キャンセル'].includes(v)) return v

  // スプレッドシート固有の値をマッピング
  if (v.includes('取消') || v.includes('キャンセル') || v.includes('cancel') || v.includes('Cancel')) return 'キャンセル'
  if (v === '開通' || v.includes('開通')) return '開通'
  if (v.includes('工事日') || v.includes('工事確') || v === '工事済') return '工事日決定'
  return '手続き中'
}

function parseRow(row: string[]) {
  const sei = cell(row, COL.sei)
  const mei = cell(row, COL.mei)
  const customerName = [sei, mei].filter(Boolean).join(' ')

  const banchi   = cell(row, COL.banchi)
  const building = cell(row, COL.building)
  const room     = cell(row, COL.room)
  const address  = [banchi, building, room].filter(Boolean).join(' ')

  const notes1 = cell(row, COL.notes)
  const notes2 = cell(row, COL.special_notes)
  const notes  = [notes1, notes2].filter(Boolean).join('\n')

  return {
    rep_name:          cell(row, COL.rep_name),
    customer_name:     customerName,
    phone:             normalizePhone(cell(row, COL.phone)),
    area_pref:         cell(row, COL.area_pref),
    area_city:         cell(row, COL.area_city),
    address,
    wifi_provider:     cell(row, COL.wifi_provider),
    acquired_date:     parseDate(cell(row, COL.acquired_date)),
    construction_date: parseDate(cell(row, COL.construction_date)),
    open_date:         parseDate(cell(row, COL.open_date)),
    status:            normalizeStatus(cell(row, COL.status)),
    notes,
  }
}

export async function GET() {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_SHEETS_API_KEY not set' }, { status: 500 })
  }

  const sheetName = await getSheetName(CONTRACT_SPREADSHEET_ID, apiKey)
  if (!sheetName) {
    return NextResponse.json({ error: `gid=${TARGET_GID} のシートが見つかりません` }, { status: 404 })
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONTRACT_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }
  const json = await res.json()
  const allRows: string[][] = json.values || []

  if (allRows.length < 2) {
    return NextResponse.json({ rows: [], sheetName })
  }

  // 1行目がヘッダー、2行目以降がデータ
  const dataRows = allRows.slice(1)
    .map(parseRow)
    .filter(r => r.customer_name)  // 顧客名がある行のみ

  return NextResponse.json({ rows: dataRows, sheetName, total: dataRows.length })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_SHEETS_API_KEY not set' }, { status: 500 })
  }

  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', session.user.id)
    .single()
  const orgId = (member as any)?.organization_id

  // 担当者名 → ID マッピング（スペースなし・全角スペースも考慮）
  const { data: reps } = await supabase
    .from('sales_reps')
    .select('id, name')
    .eq('is_active', true)

  const repMap: Record<string, string> = {}
  for (const r of reps || []) {
    repMap[r.name] = r.id
    repMap[r.name.replace(/\s/g, '')] = r.id
    repMap[r.name.replace(/　/g, '')] = r.id  // 全角スペース除去
  }

  const body = await req.json()
  const rows: ReturnType<typeof parseRow>[] = body.rows || []

  const today = new Date().toISOString().split('T')[0]
  const toInsert = []
  const skipped: string[] = []

  for (const row of rows) {
    const nameKey = row.rep_name.replace(/\s/g, '').replace(/　/g, '')
    const repId = repMap[row.rep_name] || repMap[nameKey]

    if (!repId) {
      skipped.push(
        row.rep_name
          ? `${row.customer_name}（担当者不明: ${row.rep_name}）`
          : `${row.customer_name}（担当者未設定）`
      )
      continue
    }

    toInsert.push({
      sales_rep_id:          repId,
      customer_name:         row.customer_name,
      phone:                 row.phone || '',
      address:               row.address || '',
      area_pref:             row.area_pref || '',
      area_city:             row.area_city || '',
      wifi_provider:         row.wifi_provider || '',
      wifi_provider_other:   '',
      acquired_date:         row.acquired_date || today,
      construction_date:     row.construction_date || null,
      status:                row.status || '手続き中',
      needs_option_removal:  true,
      needs_landline_removal:false,
      needs_router_removal:  false,
      option_removed:        false,
      landline_removed:      false,
      router_removed:        false,
      construction_called:   false,
      notes:                 row.notes || '',
      organization_id:       orgId || null,
      updated_at:            new Date().toISOString(),
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped,
      error: '担当者が一致するデータがありませんでした',
    })
  }

  const { error } = await supabase.from('contracts').insert(toInsert)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ imported: toInsert.length, skipped })
}
