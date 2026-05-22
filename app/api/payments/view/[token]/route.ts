import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// GET /api/payments/view/[token]
// 認証不要（view_token が秘密鍵の役割）
// LINE ブラウザから直接 HTML を表示するためのエンドポイント
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('payment_notifications')
    .select('html_content, sales_reps(name)')
    .eq('view_token', params.token)
    .single()

  if (error || !data?.html_content) {
    return new NextResponse('支払通知書が見つかりません', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new NextResponse(data.html_content, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
