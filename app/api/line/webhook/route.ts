import { NextRequest, NextResponse } from 'next/server'

// LINEからのwebhookを受け取りgroupIdを記録する
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    events: Array<{
      type: string
      source: { type: string; groupId?: string; userId?: string }
      message?: { type: string; text?: string }
    }>
  }

  for (const event of body.events ?? []) {
    const groupId = event.source?.groupId
    const userId  = event.source?.userId
    const text    = event.message?.text ?? ''

    // ログ出力（Vercelのログで確認できる）
    console.log('[LINE Webhook]', JSON.stringify({
      type: event.type,
      sourceType: event.source.type,
      groupId,
      userId,
      text,
    }))

    // グループ内で「groupid」と送るとbotがグループIDを返信
    if (groupId && text.toLowerCase().includes('groupid')) {
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          replyToken: (event as { replyToken?: string }).replyToken,
          messages: [{ type: 'text', text: `グループID:\n${groupId}` }],
        }),
      })
    }
  }

  return NextResponse.json({ ok: true })
}

// LINEのWebhook検証用
export async function GET() {
  return NextResponse.json({ ok: true, message: 'LINE webhook endpoint' })
}
