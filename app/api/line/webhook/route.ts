import { NextRequest, NextResponse } from 'next/server'

interface LineEvent {
  type: string
  replyToken?: string
  source: { type: string; groupId?: string; userId?: string }
  message?: { type: string; text?: string }
}

async function replyLine(replyToken: string, text: string) {
  return fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}

async function pushLine(to: string, text: string) {
  return fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { events: LineEvent[] }

  for (const event of body.events ?? []) {
    const groupId    = event.source?.groupId
    const userId     = event.source?.userId
    const text       = event.message?.text?.toLowerCase() ?? ''
    const replyToken = event.replyToken

    console.log('[LINE Webhook]', JSON.stringify({
      type: event.type,
      sourceType: event.source.type,
      groupId,
      userId,
      text: event.message?.text,
    }))

    // グループ内で「groupid」と送るとグループIDを返信
    if (groupId && text.includes('groupid')) {
      const msg = `グループID:\n${groupId}`
      if (replyToken) {
        await replyLine(replyToken, msg)
      } else {
        // replyTokenがない場合はpushで返信
        await pushLine(groupId, msg)
      }
    }

    // 個人DMで「groupid」→ユーザーIDを返信
    if (!groupId && userId && text.includes('groupid') && replyToken) {
      await replyLine(replyToken, `あなたのユーザーID:\n${userId}\n\n※グループIDを取得するにはグループ内で送信してください`)
    }
  }

  return NextResponse.json({ ok: true })
}

// LINEのWebhook URL確認用
export async function GET() {
  return NextResponse.json({ ok: true, message: 'LINE webhook is active' })
}
