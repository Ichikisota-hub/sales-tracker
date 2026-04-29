import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { backupToSheets } from '@/lib/googleSheets'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getOrgFromSession(req: NextRequest): Promise<{ orgId: string; spreadsheetId: string } | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_ANON_KEY!,
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

// POST /api/sheets/backup
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません' }, { status: 500 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    let { spreadsheetId, orgIds } = body as { spreadsheetId?: string; orgIds?: string[] }

    if (!spreadsheetId || !orgIds) {
      const org = await getOrgFromSession(req)
      if (org) {
        spreadsheetId = spreadsheetId || org.spreadsheetId
        orgIds = orgIds || [org.orgId]
      }
    }

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'spreadsheetId が見つかりません。組織設定でスプレッドシートIDを登録してください。' },
        { status: 400 }
      )
    }

    const stats = await backupToSheets(spreadsheetId, orgIds)

    return NextResponse.json({
      success: true,
      message: `バックアップ完了 (${stats.date})`,
      stats,
      backedUpAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('Sheets backup error:', err)
    return NextResponse.json(
      { error: err.message || 'バックアップに失敗しました' },
      { status: 500 }
    )
  }
}
