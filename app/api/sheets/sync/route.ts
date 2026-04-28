import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { syncAllToSheets } from '@/lib/googleSheets'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// セッションからユーザーの組織とシートIDを自動取得
async function getOrgFromSession(req: NextRequest): Promise<{ orgId: string; spreadsheetId: string } | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const service = getServiceClient()
  const { data: member } = await service
    .from('organization_members')
    .select('organization_id, organizations(settings)')
    .eq('user_id', user.id)
    .order('joined_at')
    .limit(1)
    .single()

  if (!member) return null
  const orgId = member.organization_id
  const spreadsheetId = (member as any).organizations?.settings?.google_sheet_id
  if (!spreadsheetId) return null
  return { orgId, spreadsheetId }
}

// POST /api/sheets/sync
// body は省略可。省略時はセッションから組織を自動検出
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません' }, { status: 500 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    let { spreadsheetId, orgIds } = body as { spreadsheetId?: string; orgIds?: string[] }

    // パラメータが省略された場合はセッションから取得
    if (!spreadsheetId || !orgIds) {
      const org = await getOrgFromSession(req)
      if (org) {
        spreadsheetId = spreadsheetId || org.spreadsheetId
        orgIds = orgIds || [org.orgId]
      }
    } else if (!spreadsheetId && orgIds && orgIds.length > 0) {
      const service = getServiceClient()
      const { data } = await service.from('organizations').select('settings').eq('id', orgIds[0]).single()
      spreadsheetId = (data?.settings as any)?.google_sheet_id
    }

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'spreadsheetId が見つかりません。組織設定でスプレッドシートIDを登録してください。' },
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
    message: hasKey ? 'Service Account が設定済みです' : 'GOOGLE_SERVICE_ACCOUNT_KEY が未設定です',
  })
}
