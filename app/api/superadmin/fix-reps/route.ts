import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_KEY = 'Origin0201'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-superadmin-key') !== SUPERADMIN_KEY) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { organizationId } = await req.json()
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId が必要です' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // organization_id が未設定の sales_reps を一括更新
  const { data, error } = await supabase
    .from('sales_reps')
    .update({ organization_id: organizationId })
    .is('organization_id', null)
    .select('id, name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: data?.length ?? 0, reps: data })
}
