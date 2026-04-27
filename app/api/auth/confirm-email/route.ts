import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// メール確認済みにする（開発・セットアップ用）
export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const supabase = getServiceClient()

  // ユーザーをメールアドレスで検索
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const user = users.find(u => u.email === email)
  if (!user) return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })

  // メール確認済みにする
  const { error } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, userId: user.id })
}
