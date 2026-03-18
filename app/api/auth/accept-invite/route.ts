import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { token, userId } = await req.json()

  if (!token || !userId) {
    return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 1. 招待を取得・検証
  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: '招待が見つかりません' }, { status: 404 })
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'この招待はすでに使用されています' }, { status: 400 })
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: '招待の有効期限が切れています' }, { status: 400 })
  }

  // 2. organization_members に追加（重複チェック）
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', invitation.organization_id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: invitation.organization_id,
        user_id: userId,
        role: invitation.role,
      })

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 })
    }
  }

  // 3. 招待を使用済みにマーク
  await supabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  return NextResponse.json({ success: true })
}
