import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''

async function pushLine(to: string, text: string) {
  if (!LINE_TOKEN || !to) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
}

// シフト変更申請の提出
export async function POST(req: NextRequest) {
  const supabase = await createServiceClient()
  const { requesterRepId, organizationId, originalDate, requestedDate, reason } =
    await req.json() as { requesterRepId: string; organizationId: string; originalDate: string; requestedDate?: string; reason: string }

  // 申請を保存
  const { data: request, error } = await supabase
    .from('shift_change_requests')
    .insert({ requester_rep_id: requesterRepId, organization_id: organizationId, original_date: originalDate, requested_date: requestedDate ?? null, reason })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 申請者の名前を取得
  const { data: requester } = await supabase
    .from('sales_reps')
    .select('name, team_id')
    .eq('id', requesterRepId)
    .single()

  // チームリーダー（責任者）のLINE IDを取得
  if (requester?.team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name, leader_sales_rep_id')
      .eq('id', requester.team_id)
      .single()

    if (team?.leader_sales_rep_id) {
      const { data: leader } = await supabase
        .from('sales_reps')
        .select('name, line_user_id')
        .eq('id', team.leader_sales_rep_id)
        .single()

      if (leader?.line_user_id) {
        const dateStr = requestedDate
          ? `${originalDate} → ${requestedDate}`
          : `${originalDate}（日程未定）`

        await pushLine(leader.line_user_id,
          `📅 シフト変更申請\n\n申請者: ${requester.name}\n変更日程: ${dateStr}\n理由: ${reason}\n\n管理画面で確認・承認してください。`)

        await supabase
          .from('shift_change_requests')
          .update({ line_notified_at: new Date().toISOString() })
          .eq('id', request.id)
      }
    }
  }

  return NextResponse.json({ ok: true, id: request.id })
}

// 申請の承認・却下
export async function PATCH(req: NextRequest) {
  const supabase = await createServiceClient()
  const { id, status, reviewerRepId, comment } =
    await req.json() as { id: string; status: 'approved' | 'rejected'; reviewerRepId: string; comment?: string }

  const { error } = await supabase
    .from('shift_change_requests')
    .update({ status, reviewer_rep_id: reviewerRepId, reviewer_comment: comment ?? '', reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 申請者にLINE通知
  const { data: request } = await supabase
    .from('shift_change_requests')
    .select('requester_rep_id, original_date, requested_date, sales_reps(name, line_user_id)')
    .eq('id', id)
    .single()

  const rep = (request?.sales_reps as unknown) as { name: string; line_user_id: string | null } | null
  if (rep?.line_user_id) {
    const icon = status === 'approved' ? '✅' : '❌'
    const label = status === 'approved' ? '承認されました' : '却下されました'
    await pushLine(rep.line_user_id,
      `${icon} シフト変更申請が${label}\n\n対象日: ${request?.original_date}\n${comment ? `コメント: ${comment}` : ''}`)
  }

  return NextResponse.json({ ok: true })
}
