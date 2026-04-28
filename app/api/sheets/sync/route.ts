import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { syncAllToSheets } from '@/lib/googleSheets'

// 組織のgoogle_sheet_idを取得
async function getOrgSheetId(organizationId: string): Promise<string | null> {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data } = await supabase.from('organizations').select('settings').eq('id', organizationId).single()
  return (data?.settings as any)?.google_sheet_id || null
}

// POST /api/sheets/sync
// body: { spreadsheetId?: string, orgIds?: string[] }
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません。環境変数を確認してください。' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    let { spreadsheetId, orgIds } = body as { spreadsheetId?: string; orgIds?: string[] }

    // spreadsheetId が指定されていなければ、orgIds[0] の設定から取得
    if (!spreadsheetId && orgIds && orgIds.length > 0) {
      spreadsheetId = (await getOrgSheetId(orgIds[0])) || undefined
    }

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'spreadsheetId が指定されていません。組織設定でスプレッドシートIDを登録してください。' },
        { status: 400 }
      )
    }

    const stats = await syncAllToSheets(spreadsheetId, orgIds)

    return NextResponse.json({
      success: true,
      message: 'Googleスプレッドシートへの同期が完了しました',
      stats,
      syncedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('Sheets sync error:', err)
    return NextResponse.json(
      { error: err.message || 'スプレッドシートの同期に失敗しました' },
      { status: 500 }
    )
  }
}

// GET /api/sheets/sync - 設定確認
export async function GET() {
  const hasKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  return NextResponse.json({
    configured: hasKey,
    message: hasKey
      ? 'Service Account が設定済みです'
      : 'GOOGLE_SERVICE_ACCOUNT_KEY が未設定です',
  })
}
