import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ALLOWED_SLUGS = ['origin', 'top']
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/auth/self-register
// body: { name, email, password, orgSlug }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { name, email, password, orgSlug } = body

  if (!name || !email || !password || !orgSlug) {
    return NextResponse.json({ error: '全項目を入力してください' }, { status: 400 })
  }
  if (!ALLOWED_SLUGS.includes(orgSlug)) {
    return NextResponse.json({ error: '無効な代理店です' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'パスワードは6文字以上で入力してください' }, { status: 400 })
  }

  const service = getServiceClient()

  // 1. 代理店（org）をslugで取得
  const { data: org, error: orgErr } = await service
    .from('organizations')
    .select('id, name, is_active')
    .eq('slug', orgSlug)
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: '代理店が見つかりません' }, { status: 404 })
  }
  if (!org.is_active) {
    return NextResponse.json({ error: 'この代理店は現在登録を受け付けていません' }, { status: 403 })
  }

  // 2. auth.usersにユーザー作成（メール確認スキップ）
  const { data: authUser, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })

  if (createErr || !authUser.user) {
    const msg = createErr?.message ?? '不明なエラー'
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return NextResponse.json({ error: 'このメールアドレスはすでに使用されています' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // 3. organization_members にINSERT（role=member）
  const { error: memErr } = await service.from('organization_members').insert({
    organization_id: org.id,
    user_id: authUser.user.id,
    role: 'member',
  })

  if (memErr) {
    // ロールバック: 作成したauth userを削除
    await service.auth.admin.deleteUser(authUser.user.id).catch(() => {})
    return NextResponse.json({ error: memErr.message }, { status: 500 })
  }

  // 4. ログイン（Cookieをセット）
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              maxAge: COOKIE_MAX_AGE,
              sameSite: 'lax',
              path: '/',
              secure: process.env.NODE_ENV === 'production',
            })
          })
        },
      },
    }
  )

  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signInErr) {
    return NextResponse.json({ error: 'アカウントを作成しましたが自動ログインに失敗しました。ログインページからログインしてください' }, { status: 200 })
  }

  return NextResponse.json({ ok: true, orgName: org.name })
}
