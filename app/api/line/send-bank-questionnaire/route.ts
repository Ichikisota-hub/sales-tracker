import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function push(to: string, text: string) {
  return fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
}

// POST /api/line/send-bank-questionnaire
// 銀行情報未登録の担当者全員にLINEで入力依頼を送信
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET && secret !== 'Origin0201') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getService()

  const { data: reps } = await supabase
    .from('sales_reps')
    .select('id, name, line_user_id, bank_name')
    .eq('is_active', true)
    .not('line_user_id', 'is', null)

  const targets = (reps ?? []).filter(r => !r.bank_name)
  let sent = 0

  for (const rep of targets) {
    const res = await push(
      rep.line_user_id!,
      `💳 ${rep.name}さんへ\n\nお支払いのため、銀行口座情報の登録をお願いします。\n\n「銀行情報」と送信すると登録が開始されます。`
    )
    if (res.ok) sent++
    await new Promise(r => setTimeout(r, 300)) // レート制限対策
  }

  return NextResponse.json({ ok: true, sent, total: targets.length })
}
