import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/admin/settings - 現在の組織設定を取得
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const orgId = searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const supabase = getServiceClient()
  const { data, error } = await supabase.from('organizations').select('settings').eq('id', orgId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: data?.settings || {} })
}

// PATCH /api/admin/settings - 組織設定を更新
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { orgId, settings } = body as { orgId: string; settings: Record<string, unknown> }
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  const supabase = getServiceClient()

  // 既存設定をマージ
  const { data: existing } = await supabase.from('organizations').select('settings').eq('id', orgId).single()
  const merged = { ...(existing?.settings || {}), ...settings }

  const { error } = await supabase.from('organizations').update({ settings: merged }).eq('id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, settings: merged })
}
