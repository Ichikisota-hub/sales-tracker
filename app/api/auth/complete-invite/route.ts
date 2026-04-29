import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 招待トークンを使ってサーバーサイドでアカウント設定を完了する
export async function POST(req: NextRequest) {
  const { token, password, fullName, agency } = await req.json()

  if (!token || !password || !fullName) {
    return NextResponse.json({ error: 'token, password, fullName が必要です' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'パスワードは6文字以上で入力してください' }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 1. invitations テーブルからトークンを検索・検証
  const { data: invitation, error: invErr } = await supabase
    .from('invitations')
    .select('*, organizations(name)')
    .eq('token', token)
    .single()

  if (invErr || !invitation) {
    return NextResponse.json({ error: '招待リンクが無効です' }, { status: 400 })
  }
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'この招待リンクはすでに使用されています' }, { status: 400 })
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: '招待リンクの有効期限が切れています' }, { status: 400 })
  }

  const email = invitation.email as string
  const orgId = invitation.organization_id as string
  const repIdFromInvite = invitation.rep_id as string | null

  // 2. 既存ユーザーを検索
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

  let userId: string

  if (!existingUser) {
    // 3. 新規ユーザー作成（メール確認不要、service role 経由）
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        agency: agency || '',
      },
    })
    if (createErr || !created.user) {
      return NextResponse.json({ error: createErr?.message || 'ユーザー作成に失敗しました' }, { status: 500 })
    }
    userId = created.user.id
  } else {
    // 4. 既存ユーザーのパスワード・メタデータを更新
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      user_metadata: {
        full_name: fullName.trim(),
        agency: agency || '',
      },
    })
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
    userId = existingUser.id
  }

  // 5. organization_members に追加（重複チェック）
  const { data: existingMember } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingMember) {
    const { error: memberErr } = await supabase.from('organization_members').insert({
      organization_id: orgId,
      user_id: userId,
      role: invitation.role || 'member',
      joined_at: new Date().toISOString(),
      ...(repIdFromInvite ? { sales_rep_id: repIdFromInvite } : {}),
    })
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 })
    }
  }

  // 6. rep_id がない場合 → fullName で sales_reps を名前マッチ
  //    ORIGIN組織: 名前マッチのみ（既存データと紐付け）
  //    それ以外の組織: 名前マッチで見つからない場合は自動作成
  if (!repIdFromInvite) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single()

    if (membership) {
      const { data: rep } = await supabase
        .from('sales_reps')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('name', fullName.trim())
        .eq('is_active', true)
        .single()

      if (rep) {
        // 重複チェック（同担当者が別メンバーに紐付いていないか）
        const { data: alreadyLinked } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', orgId)
          .eq('sales_rep_id', rep.id)
          .neq('user_id', userId)
          .maybeSingle()

        if (!alreadyLinked) {
          await supabase
            .from('organization_members')
            .update({ sales_rep_id: rep.id })
            .eq('id', membership.id)
        }
      } else {
        // 担当者が存在しない場合は自動作成して紐付け
        const { data: maxRep } = await supabase
          .from('sales_reps')
          .select('display_order')
          .eq('organization_id', orgId)
          .order('display_order', { ascending: false })
          .limit(1)
          .maybeSingle()

        const nextOrder = (maxRep?.display_order ?? 0) + 1

        const { data: newRep } = await supabase
          .from('sales_reps')
          .insert({
            organization_id: orgId,
            name: fullName.trim(),
            is_active: true,
            display_order: nextOrder,
          })
          .select('id')
          .single()

        if (newRep) {
          await supabase
            .from('organization_members')
            .update({ sales_rep_id: newRep.id })
            .eq('id', membership.id)
        }
      }
    }
  }

  // 7. invitation を使用済みにマーク
  await supabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token)

  return NextResponse.json({ success: true, email })
}
