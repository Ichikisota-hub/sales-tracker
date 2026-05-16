import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const COOKIE_MAX_AGE = 400 * 24 * 60 * 60 // 400日（@supabase/ssr デフォルトと同じ）

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'email と password が必要です' }, { status: 400 })
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              maxAge: (options as any)?.maxAge ?? COOKIE_MAX_AGE,
              sameSite: 'lax',
              // httpOnly不要: サーバー経由Set-CookieでITP対策済み。
              // httpOnly=trueにするとブラウザ側createBrowserClientがセッションを読めなくなる
              path: '/',
              secure: process.env.NODE_ENV === 'production',
            })
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.includes('Email not confirmed') || error.message.includes('email_not_confirmed')) {
      return NextResponse.json({ error: 'メールアドレスが未確認です。管理者に連絡してください。' }, { status: 401 })
    }
    if (error.message.includes('Invalid login credentials')) {
      return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません。' }, { status: 401 })
    }
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  if (!data.session) {
    return NextResponse.json({ error: 'セッションの取得に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
