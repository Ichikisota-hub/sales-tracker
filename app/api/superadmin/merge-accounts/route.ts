import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_KEY = 'Origin0201'
const ORIGIN_ORG_ID = '0524dcfa-685f-4635-971b-39c7899da7cd'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: 両アカウントの現状確認
export async function GET(req: NextRequest) {
  if (req.headers.get('x-superadmin-key') !== SUPERADMIN_KEY) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const fromEmail = req.nextUrl.searchParams.get('from')
  const toEmail   = req.nextUrl.searchParams.get('to')
  if (!fromEmail || !toEmail) {
    return NextResponse.json({ error: 'from と to が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  const fromUser = users.find(u => u.email?.toLowerCase() === fromEmail.toLowerCase())
  const toUser   = users.find(u => u.email?.toLowerCase() === toEmail.toLowerCase())

  const [fromMember, toMember] = await Promise.all([
    fromUser
      ? supabase.from('organization_members').select('id, sales_rep_id, role').eq('user_id', fromUser.id).maybeSingle()
      : Promise.resolve({ data: null }),
    toUser
      ? supabase.from('organization_members').select('id, sales_rep_id, role').eq('user_id', toUser.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let repName: string | null = null
  const repId = (fromMember.data as any)?.sales_rep_id
  if (repId) {
    const { data: rep } = await supabase.from('sales_reps').select('name').eq('id', repId).maybeSingle()
    repName = rep?.name ?? null
  }

  return NextResponse.json({
    from: {
      found: !!fromUser,
      userId: fromUser?.id,
      email: fromUser?.email,
      fullName: fromUser?.user_metadata?.full_name ?? null,
      membershipRole: (fromMember.data as any)?.role ?? null,
      salesRepId: (fromMember.data as any)?.sales_rep_id ?? null,
      salesRepName: repName,
    },
    to: {
      found: !!toUser,
      userId: toUser?.id,
      email: toUser?.email,
      fullName: toUser?.user_metadata?.full_name ?? null,
      membershipRole: (toMember.data as any)?.role ?? null,
      salesRepId: (toMember.data as any)?.sales_rep_id ?? null,
    },
  })
}

// POST: アカウント移管実行
export async function POST(req: NextRequest) {
  if (req.headers.get('x-superadmin-key') !== SUPERADMIN_KEY) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { fromEmail, toEmail, newPassword } = await req.json()
  if (!fromEmail || !toEmail) {
    return NextResponse.json({ error: 'fromEmail と toEmail が必要です' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  const fromUser = users.find(u => u.email?.toLowerCase() === fromEmail.toLowerCase())
  const toUser   = users.find(u => u.email?.toLowerCase() === toEmail.toLowerCase())

  if (!fromUser) return NextResponse.json({ error: `移管元 ${fromEmail} が見つかりません` }, { status: 404 })
  if (!toUser)   return NextResponse.json({ error: `移管先 ${toEmail} が見つかりません` }, { status: 404 })

  const log: string[] = []

  // 1. 移管元の organization_members を取得
  const { data: fromMember } = await supabase
    .from('organization_members')
    .select('*')
    .eq('user_id', fromUser.id)
    .eq('organization_id', ORIGIN_ORG_ID)
    .maybeSingle()

  if (!fromMember) {
    return NextResponse.json({ error: '移管元にメンバーシップがありません' }, { status: 404 })
  }

  // 2. 移管先の organization_members を確認・更新
  const { data: toMember } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', toUser.id)
    .eq('organization_id', ORIGIN_ORG_ID)
    .maybeSingle()

  if (toMember) {
    // 既存のメンバーシップを更新
    await supabase
      .from('organization_members')
      .update({
        sales_rep_id: fromMember.sales_rep_id,
        role: fromMember.role,
      })
      .eq('id', toMember.id)
    log.push(`移管先のメンバーシップを更新（sales_rep_id: ${fromMember.sales_rep_id}）`)
  } else {
    // 新規作成
    await supabase
      .from('organization_members')
      .insert({
        organization_id: ORIGIN_ORG_ID,
        user_id: toUser.id,
        role: fromMember.role,
        sales_rep_id: fromMember.sales_rep_id,
        joined_at: fromMember.joined_at ?? new Date().toISOString(),
      })
    log.push(`移管先に新規メンバーシップを作成（role: ${fromMember.role}, sales_rep_id: ${fromMember.sales_rep_id}）`)
  }

  // 3. 移管先ユーザーのメタデータを更新（full_name を引き継ぎ）
  const fullName = (fromUser.user_metadata?.full_name as string | undefined) ?? null
  const updatePayload: Record<string, unknown> = {
    user_metadata: {
      ...toUser.user_metadata,
      full_name: fullName || toUser.user_metadata?.full_name,
    },
  }
  if (newPassword && newPassword.length >= 6) {
    updatePayload.password = newPassword
    log.push('パスワードを設定しました')
  }
  await supabase.auth.admin.updateUserById(toUser.id, updatePayload)
  log.push(`メタデータを更新（full_name: ${fullName}）`)

  // 4. 移管元のメンバーシップを削除（同じ sales_rep に重複させない）
  await supabase
    .from('organization_members')
    .delete()
    .eq('id', fromMember.id)
  log.push(`移管元（${fromEmail}）のメンバーシップを削除`)

  return NextResponse.json({ success: true, log })
}
