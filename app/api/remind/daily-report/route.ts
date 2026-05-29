/**
 * POST /api/remind/daily-report
 * sales-tracker: 日報未提出者にLINEで通知
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const LINE_TOKEN   = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const SLACK_TOKEN  = process.env.SLACK_BOT_TOKEN ?? ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ORIGIN_ORG_ID = '0524dcfa-685f-4635-971b-39c7899da7cd'

function todayStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

async function sendLine(to: string, text: string) {
  if (!LINE_TOKEN || !to) return false
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
  return res.ok
}

async function sendSlack(channel: string, text: string) {
  if (!SLACK_TOKEN || !channel) return false
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  })
  return (await res.json()).ok
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const targetDate = body.target_date === 'yesterday' ? todayStr(-1) : todayStr(0)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // ORIGINのアクティブなsales_repsとauth_user_id、LINE IDを取得
  const { data: reps } = await supabase
    .from('sales_reps')
    .select('id, name, auth_user_id')
    .eq('organization_id', ORIGIN_ORG_ID)
    .eq('is_active', true)
    .not('auth_user_id', 'is', null)

  if (!reps?.length) return NextResponse.json({ message: 'メンバーなし' })

  // 対象日の日報提出済みを取得
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('sales_rep_id')
    .eq('report_date', targetDate)
    .in('sales_rep_id', reps.map(r => r.id))

  const submittedRepIds = new Set((reports ?? []).map(r => r.sales_rep_id))

  // 対象日に稼働予定のrep_idのみ取得
  const { data: schedules } = await supabase
    .from('work_schedules')
    .select('sales_rep_id')
    .eq('schedule_date', targetDate)
    .eq('work_status', '稼働')
    .in('sales_rep_id', reps.map(r => r.id))

  const scheduledRepIds = new Set((schedules ?? []).map(s => s.sales_rep_id))
  const unsubmitted = reps.filter(r => scheduledRepIds.has(r.id) && !submittedRepIds.has(r.id))

  // kaika usersテーブルからLINE IDを取得
  const authIds = unsubmitted.map(r => r.auth_user_id).filter(Boolean)
  const { data: kaikaUsers } = authIds.length > 0
    ? await supabase.from('users').select('id, line_user_id').in('id', authIds)
    : { data: [] }

  const lineMap = Object.fromEntries((kaikaUsers ?? []).map(u => [u.id, u.line_user_id]))

  const dateLabel = targetDate === todayStr(0) ? '今日' : '昨日'
  const results: { name: string; sent: boolean; method: string }[] = []

  for (const rep of unsubmitted) {
    const lineId = lineMap[rep.auth_user_id]
    const message = `【日報未提出のお知らせ】\n\n${rep.name}さん、${dateLabel}（${targetDate}）の日報がまだ提出されていません。\n\n提出をお願いします。`

    let sent = false, method = 'none'
    if (lineId) { sent = await sendLine(lineId, message); method = 'line' }

    results.push({ name: rep.name, sent, method })
  }

  return NextResponse.json({
    date: targetDate,
    total: reps.length,
    submitted: submittedRepIds.size,
    unsubmitted: unsubmitted.length,
    results,
  })
}
