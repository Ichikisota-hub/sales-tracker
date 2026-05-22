import { NextRequest, NextResponse } from 'next/server'
import { syncCalendarSheet } from '@/lib/syncCalendarSheet'

// POST /api/sheets/sync-calendar
// Supabase webhook または Vercel cron から呼ばれる
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (process.env.SHEETS_WEBHOOK_SECRET && secret !== process.env.SHEETS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await syncCalendarSheet()
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[sync-calendar] error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/sheets/sync-calendar  ← Vercel cron 用
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await syncCalendarSheet()
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[sync-calendar cron] error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
