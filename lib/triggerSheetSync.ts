'use server'

import { syncAllToSheets } from '@/lib/googleSheets'
import { createClient } from '@supabase/supabase-js'

// organizationId から google_sheet_id を取得して同期
export async function triggerSheetSync(organizationId: string) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return // 未設定なら何もしない

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await supabase.from('organizations').select('settings').eq('id', organizationId).single()
    const spreadsheetId = (data?.settings as any)?.google_sheet_id
    if (!spreadsheetId) return

    // バックグラウンドで同期（awaitしない）
    syncAllToSheets(spreadsheetId, [organizationId]).catch(err =>
      console.error('[SheetSync] error:', err.message)
    )
  } catch (err: any) {
    console.error('[SheetSync] setup error:', err.message)
  }
}
