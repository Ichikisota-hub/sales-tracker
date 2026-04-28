import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncAllToSheets } from '@/lib/googleSheets'

// Supabase Database Webhook から呼ばれる
// POST /api/sheets/webhook
// ヘッダー: x-webhook-secret: SHEETS_WEBHOOK_SECRET
export async function POST(req: NextRequest) {
  // シークレット検証
  const secret = req.headers.get('x-webhook-secret')
  if (process.env.SHEETS_WEBHOOK_SECRET && secret !== process.env.SHEETS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY not set' }, { status: 500 })
  }

  try {
    const body = await req.json()
    // Supabase webhook bodyには record.organization_id が含まれる
    const orgId = body?.record?.organization_id || body?.old_record?.organization_id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let spreadsheetId: string | undefined
    if (orgId) {
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single()
      spreadsheetId = (data?.settings as any)?.google_sheet_id
    }

    if (!spreadsheetId) {
      // 全組織をスキャン（orgIdが取れなかった場合）
      const { data: orgs } = await supabase.from('organizations').select('id, settings').eq('is_active', true)
      for (const org of orgs || []) {
        const sid = (org.settings as any)?.google_sheet_id
        if (sid) {
          // バックグラウンドで同期
          syncAllToSheets(sid, [org.id]).catch(err => console.error('[Webhook] sync error:', err.message))
        }
      }
      return NextResponse.json({ ok: true, message: 'all orgs sync triggered' })
    }

    // バックグラウンドで同期
    syncAllToSheets(spreadsheetId, [orgId]).catch(err => console.error('[Webhook] sync error:', err.message))

    return NextResponse.json({ ok: true, message: 'sync triggered', orgId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
