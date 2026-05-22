import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ステータスマッピング（楽楽販売 → sales-tracker）
function mapStatus(rakurakuStatus: string): string {
  const s = rakurakuStatus.trim()
  if (s.includes('成立') || s.includes('確定') || s.includes('契約')) return 'contracted'
  if (s.includes('取消') || s.includes('キャンセル') || s.includes('解約')) return 'cancelled'
  return 'pending'
}

// 日付パース（YYYY/MM/DD or YYYY-MM-DD → YYYY-MM-DD）
function parseDate(d: string): string | null {
  if (!d?.trim()) return null
  const m = d.trim().match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
}

// CSV行パース（ダブルクォート・カンマ対応）
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

export async function POST(req: NextRequest) {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const supabase = getServiceClient()

  // multipart/form-data からCSVファイルを取得
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })

  // バイト配列として読み込み（Shift-JIS対応）
  const buf = await file.arrayBuffer()
  let csvText: string
  try {
    // まず UTF-8 で試みる
    csvText = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // UTF-8 失敗 → Shift-JIS として再試行
    csvText = new TextDecoder('shift-jis').decode(buf)
  }

  const lines = csvText.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return NextResponse.json({ error: '有効なデータがありません' }, { status: 400 })

  // ヘッダー行を取得
  const headers = parseCSVLine(lines[0])

  // ヘッダーインデックスマップ
  const idx = (name: string) => headers.findIndex(h => h.replace(/\s/g,'') === name.replace(/\s/g,''))

  const I = {
    repName:       idx('営業担当者名'),
    seiKana:       idx('コキャクセイ(カナ)'),
    meiKana:       idx('コキャクメイ(カナ)'),
    sei:           idx('顧客名（姓）'),
    mei:           idx('顧客名（名）'),
    mobile:        idx('連絡先携帯番号'),
    tel:           idx('連絡先固定電話番号（ハイフン無しで入力）'),
    pref:          idx('都道府県'),
    city:          idx('市区'),
    town:          idx('町村番地'),
    building:      idx('物件名'),
    room:          idx('部屋番号'),
    provider:      idx('申し込みプロバイダ'),
    applyDate:     idx('申込日'),
    workDate:      idx('ジャンパ工事予定日'),
    status:             idx('【回線】契約ステータス'),
    notes:              idx('備考'),
    appNumber:          idx('申込書番号'),
    apoName:            idx('アポインター名'),
    salesRepId:         idx('営業担当ID'),
    cancelDate:         idx('【NET】解約年月日'),
    billingStartDate:   idx('【NET】課金開始日'),
    cancelReasonMajor:  idx('取消理由大分類'),
    cancelReasonMinor:  idx('取消理由小分類'),
    entryStatus:        idx('エントリーステータス'),
  }

  // 担当者名 → sales_rep_id マップを事前取得
  const { data: salesReps } = await supabase
    .from('sales_reps')
    .select('id, name')
    .eq('is_active', true)
  const repMap = new Map((salesReps ?? []).map(r => [r.name.replace(/\s/g,''), r.id]))

  // ユーザーの組織IDを取得
  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const orgId = member?.organization_id

  const results = { imported: 0, skipped: [] as string[], errors: [] as string[] }
  const previewRows: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i])
    if (row.length < 3) continue

    const g = (i: number) => (i >= 0 && i < row.length ? row[i].trim() : '')

    const repName = g(I.repName)
    const customerSei = g(I.sei) || g(I.seiKana)
    const customerMei = g(I.mei) || g(I.meiKana)
    const customerName = [customerSei, customerMei].filter(Boolean).join(' ')
    const phone = g(I.mobile) || g(I.tel)
    const address = [g(I.town), g(I.building), g(I.room)].filter(Boolean).join(' ')
    const appNumber = g(I.appNumber)

    if (!customerName && !phone) continue

    // 担当者IDを解決
    const repId = repMap.get(repName.replace(/\s/g,'')) || null

    // 取消理由を結合
    const cancelReason = [g(I.cancelReasonMajor), g(I.cancelReasonMinor)]
      .filter(Boolean).join(' / ') || null

    const contract = {
      sales_rep_id:       repId,
      customer_name:      customerName || '不明',
      phone,
      address,
      area_pref:          g(I.pref),
      area_city:          g(I.city),
      wifi_provider:      g(I.provider),
      acquired_date:      parseDate(g(I.applyDate)),
      construction_date:  parseDate(g(I.workDate)),
      status:             I.status >= 0 ? mapStatus(g(I.status)) : 'pending',
      notes:              g(I.notes) || null,
      // 楽楽販売追加フィールド
      apply_number:       appNumber || null,
      cancellation_date:  parseDate(g(I.cancelDate)),
      billing_start_date: parseDate(g(I.billingStartDate)),
      cancellation_reason: cancelReason,
      entry_status:       g(I.entryStatus) || null,
      organization_id:    orgId ?? null,
      updated_at:         new Date().toISOString(),
    }

    previewRows.push({ ...contract, _rep_name: repName, _app_number: appNumber })

    // previewモード（最初の5件のみ返す）
    const isPreview = formData.get('preview') === 'true'
    if (isPreview && previewRows.length >= 5) break
  }

  if (formData.get('preview') === 'true') {
    return NextResponse.json({ preview: previewRows, total_rows: lines.length - 1 })
  }

  // 本番インポート
  for (const row of previewRows) {
    const { _rep_name, _app_number, ...contractData } = row

    // apply_number で重複チェック（新フィールド）
    if (_app_number) {
      const { data: existing } = await supabase
        .from('contracts')
        .select('id')
        .eq('apply_number', _app_number)
        .maybeSingle()

      if (existing) {
        await supabase.from('contracts').update(contractData).eq('id', existing.id)
        results.imported++
        continue
      }
    }

    const { error } = await supabase.from('contracts').insert(contractData)
    if (error) {
      results.errors.push(`${contractData.customer_name}: ${error.message}`)
    } else {
      results.imported++
      if (!contractData.sales_rep_id) {
        results.skipped.push(`${contractData.customer_name}（担当者「${_rep_name}」未登録）`)
      }
    }
  }

  return NextResponse.json(results)
}
