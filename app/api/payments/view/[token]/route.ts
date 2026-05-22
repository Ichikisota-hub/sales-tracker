import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// GET /api/payments/view/[token]?print=1  → PDFモード（自動印刷ダイアログ）
// GET /api/payments/view/[token]          → 通常表示
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = await createServiceClient()
  const autoPrint = req.nextUrl.searchParams.get('print') === '1'

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

  // 元のHTMLに印刷ボタンとPDFスタイルを追加
  const printBar = `
<style>
  .print-bar {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    background: #1a3a6b;
    padding: 10px 16px;
    display: flex;
    gap: 10px;
    z-index: 1000;
  }
  .print-bar button {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
  }
  .btn-pdf { background: #fff; color: #1a3a6b; }
  .btn-close { background: rgba(255,255,255,0.2); color: #fff; }
  @media print {
    .print-bar { display: none !important; }
    body { padding-bottom: 0 !important; }
  }
</style>
<div style="padding-bottom: 70px;"></div>
<div class="print-bar">
  <button class="btn-pdf" onclick="window.print()">📄 PDFで保存</button>
  <button class="btn-close" onclick="window.history.back()">✕ 閉じる</button>
</div>
${autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),600))</script>' : ''}
`

  // </body>の直前に挿入
  const htmlWithPrint = data.html_content.replace('</body>', printBar + '</body>')

  return new NextResponse(htmlWithPrint, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
