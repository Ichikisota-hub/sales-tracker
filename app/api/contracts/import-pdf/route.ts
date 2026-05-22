import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function parseDate(s: string): string | null {
  if (!s?.trim()) return null
  const m = s.trim().match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  const m2 = s.trim().match(/^(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m2) return `20${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`
  return null
}

function cleanPhone(s: string): string {
  return s.replace(/[^\d]/g, '')
}

function mapStatus(s: string): string {
  if (/成立|確定|契約|開通|完了/.test(s)) return 'contracted'
  if (/取消|キャンセル|解約|廃止/.test(s)) return 'cancelled'
  return 'pending'
}

// ── 楽楽販売PDF の行パーサー ──────────────────────────────────────────────
// PDFからテキスト抽出後、行単位でパターンマッチング
function parseRakurakuText(text: string): {
  rows: any[]
  raw_lines: string[]
} {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
  const rows: any[] = []

  // 行を走査して契約データのブロックを検出
  // 楽楽販売PDFの各レコードは複数行にわたることが多い
  // キーワードで開始行を検出する
  let i = 0
  let currentBlock: string[] = []
  
  // ブロック検出: 「通番」や数字+空白で始まる行をレコード開始とみなす
  while (i < lines.length) {
    const line = lines[i]
    
    // 新しいレコードの開始を検出（数字のみの行、または番号で始まる行）
    const isNewRecord = /^\d+$/.test(line) || /^\d+\s+[^\d]/.test(line)
    
    if (isNewRecord && currentBlock.length > 0) {
      const parsed = parseBlock(currentBlock)
      if (parsed) rows.push(parsed)
      currentBlock = [line]
    } else {
      currentBlock.push(line)
    }
    i++
  }
  if (currentBlock.length > 0) {
    const parsed = parseBlock(currentBlock)
    if (parsed) rows.push(parsed)
  }

  // ブロック方式で取れなかった場合、フラットなパターンマッチで再試行
  if (rows.length === 0) {
    return parseFlatText(text, lines)
  }

  return { rows, raw_lines: lines }
}

function parseBlock(block: string[]): any | null {
  const text = block.join(' ')
  
  // 担当者名の抽出（「営業担当」「担当者」の後の名前）
  const repMatch = text.match(/営業担当[者名]?\s*[:：]?\s*([^\s,、\d]{2,10})/)
  const repName = repMatch?.[1] || ''
  
  // 担当者がいない行はスキップ
  if (!repName) return null

  // 顧客名
  const nameMatch = text.match(/顧客[名前]?\s*[:：]?\s*([^\s,、]{2,20})/) ||
                    text.match(/氏名\s*[:：]?\s*([^\s,、]{2,20})/)
  const customerName = nameMatch?.[1] || ''

  // 電話番号（携帯優先）
  const mobileMatch = text.match(/0[789]0[-\s]?\d{4}[-\s]?\d{4}/) ||
                      text.match(/\d{11}/)
  const telMatch = text.match(/0\d{1,4}[-\s]?\d{4}[-\s]?\d{4}/)
  const phone = cleanPhone(mobileMatch?.[0] || telMatch?.[0] || '')

  // 都道府県
  const prefMatch = text.match(/(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/)
  const pref = prefMatch?.[1] || ''

  // 日付
  const dateMatch = text.match(/申込[日]?\s*[:：]?\s*(\d{2,4}[\/\-年]\d{1,2}[\/\-月]\d{1,2})/)
  const acquiredDate = parseDate(dateMatch?.[1] || '')

  return {
    _rep_name: repName,
    sales_rep_id: null,
    customer_name: customerName || '不明',
    phone,
    address: '',
    area_pref: pref,
    area_city: '',
    wifi_provider: '',
    acquired_date: acquiredDate,
    construction_date: null,
    status: 'pending',
    notes: '',
  }
}

// テキストがブロック形式でない場合のフラット解析
function parseFlatText(text: string, lines: string[]): { rows: any[]; raw_lines: string[] } {
  const rows: any[] = []
  
  // 電話番号パターンで行を特定し、周辺の行から情報を取得
  const phonePattern = /0[789]0\d{8}|0\d{9,10}/g
  let match: RegExpExecArray | null
  
  while ((match = phonePattern.exec(text)) !== null) {
    const pos = match.index
    const context = text.substring(Math.max(0, pos - 200), pos + 300)
    
    const repMatch = context.match(/([^\s]{2,6})\s+(?:営業|担当)/) ||
                     context.match(/営業[担当者名]*\s*[:：]?\s*([^\s,、]{2,8})/)
    const repName = repMatch?.[1] || ''
    if (!repName) continue

    const nameMatch = context.match(/([^\s]{2,8})\s+様/) ||
                      context.match(/顧客[名]?\s*[:：]?\s*([^\s]{2,10})/)
    
    const prefMatch = context.match(/(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/)
    
    rows.push({
      _rep_name: repName,
      sales_rep_id: null,
      customer_name: nameMatch?.[1] || '抽出不可',
      phone: cleanPhone(match[0]),
      address: '',
      area_pref: prefMatch?.[1] || '',
      area_city: '',
      wifi_provider: '',
      acquired_date: null,
      construction_date: null,
      status: 'pending',
      notes: '',
    })
  }

  return { rows, raw_lines: lines }
}

export async function POST(req: NextRequest) {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })

  const isPreview = formData.get('preview') === 'true'

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const pdfData = await pdfParse(buf)
    const rawText = pdfData.text

    const { rows, raw_lines } = parseRakurakuText(rawText)

    if (isPreview) {
      return NextResponse.json({
        preview: rows.slice(0, 10),
        total_rows: rows.length,
        raw_text_sample: rawText.slice(0, 2000), // デバッグ用
        raw_lines_sample: raw_lines.slice(0, 30),
      })
    }

    // 本番インポート
    const supabase = getServiceClient()

    const { data: salesReps } = await supabase
      .from('sales_reps').select('id, name').eq('is_active', true)
    const repMap = new Map((salesReps ?? []).map(r => [r.name.replace(/\s/g,''), r.id]))

    const { data: member } = await supabase
      .from('organization_members').select('organization_id')
      .eq('user_id', user.id).maybeSingle()
    const orgId = member?.organization_id

    let imported = 0
    const skipped: string[] = []
    const errors: string[] = []

    for (const row of rows) {
      const { _rep_name, ...contractData } = row
      
      // 担当者名なしはスキップ
      if (!_rep_name?.trim()) continue
      
      contractData.sales_rep_id = repMap.get(_rep_name.replace(/\s/g,'')) || null
      contractData.organization_id = orgId ?? null
      contractData.updated_at = new Date().toISOString()

      if (!contractData.sales_rep_id) {
        skipped.push(`${contractData.customer_name}（担当者「${_rep_name}」未登録）`)
      }

      const { error } = await supabase.from('contracts').insert(contractData)
      if (error) {
        errors.push(`${contractData.customer_name}: ${error.message}`)
      } else {
        imported++
      }
    }

    return NextResponse.json({ imported, skipped, errors })
  } catch (e: any) {
    return NextResponse.json({ error: `PDF解析エラー: ${e.message}` }, { status: 500 })
  }
}
