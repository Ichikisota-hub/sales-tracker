import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

const LINE_API = 'https://api.line.me/v2/bot/message/push'

async function pushLineMessage(userId: string, messages: object[]) {
  const res = await fetch(LINE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  })
  return res.ok
}

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient()
  const { notificationId } = await req.json() as { notificationId: string }

  const { data: notification } = await supabase
    .from('payment_notifications')
    .select('*, sales_reps(name, line_user_id)')
    .eq('id', notificationId)
    .single()

  if (!notification) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const rep = notification.sales_reps as { name: string; line_user_id: string | null }

  if (!rep?.line_user_id) {
    return NextResponse.json({ error: `${rep?.name}のLINE user_idが未設定です` }, { status: 400 })
  }

  const periodLabel = `${notification.period_year}年${notification.period_month}月分`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sales-tracker-origin-pied.vercel.app'

  // view_token が未設定の場合は生成して保存
  let viewToken = notification.view_token as string | null
  if (!viewToken) {
    const token = crypto.randomUUID()
    await supabase.from('payment_notifications').update({ view_token: token }).eq('id', notificationId)
    viewToken = token
  }

  const viewUrl = `${appUrl}/api/payments/view/${viewToken}`

  const messages = [
    {
      type: 'text',
      text: `${rep.name} さん\n\n${periodLabel}の業務委託手数料支払通知書を発行しました。\n\n支払金額：¥${notification.net_amount.toLocaleString()}\n\n以下のボタンから確認してください。`,
    },
    {
      type: 'template',
      altText: '支払通知書を確認する',
      template: {
        type: 'buttons',
        text: '支払通知書',
        actions: [{
          type: 'uri',
          label: '通知書を開く',
          uri: viewUrl,
        }],
      },
    },
  ]

  const ok = await pushLineMessage(rep.line_user_id, messages)

  if (!ok) return NextResponse.json({ error: 'LINE送信に失敗しました' }, { status: 500 })

  await supabase
    .from('payment_notifications')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', notificationId)

  return NextResponse.json({ ok: true })
}
