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

// 現状確認
export async function GET(req: NextRequest) {
  if (req.headers.get('x-superadmin-key') !== SUPERADMIN_KEY) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('sales_reps')
    .select('id, name, organization_id, is_active')
    .order('display_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// organization_id が null or 指定外の sales_reps を ORIGIN に更新
export async function POST(req: NextRequest) {
  if (req.headers.get('x-superadmin-key') !== SUPERADMIN_KEY) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { organizationId } = await req.json()
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // organization_id が null のものを更新
  const { data: nullData, error: nullError } = await supabase
    .from('sales_reps')
    .update({ organization_id: organizationId })
    .is('organization_id', null)
    .select('id, name')

  if (nullError) return NextResponse.json({ error: nullError.message }, { status: 500 })

  return NextResponse.json({ updated: nullData?.length ?? 0, reps: nullData })
}

// 全 sales_reps を強制的に ORIGIN に更新（organization_id 問わず）
export async function PUT(req: NextRequest) {
  if (req.headers.get('x-superadmin-key') !== SUPERADMIN_KEY) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { organizationId } = await req.json()
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('sales_reps')
    .update({ organization_id: organizationId })
    .neq('organization_id', organizationId)
    .select('id, name, organization_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: data?.length ?? 0, reps: data })
}
