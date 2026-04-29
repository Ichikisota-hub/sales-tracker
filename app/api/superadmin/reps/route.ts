import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_KEY = 'Origin0201'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function checkAuth(req: NextRequest) {
  return req.headers.get('x-superadmin-key') === SUPERADMIN_KEY
}

// 組織の担当者一覧取得
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId が必要です' }, { status: 400 })

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('sales_reps')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('display_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
