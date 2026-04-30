import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// サーバーサイドでdaily_recordsをupsertする
// ブラウザ側のSupabaseクライアントはスキーマキャッシュが古くなる場合があるため、
// サーバーサイドのサービスロールで実行することでその問題を回避する
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const payload = await req.json()

  if (!payload.sales_rep_id || !payload.record_date) {
    return NextResponse.json({ error: 'sales_rep_id と record_date が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()

  const { error } = await supabase
    .from('daily_records')
    .upsert(payload, { onConflict: 'sales_rep_id,record_date' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
