'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '-' + Math.random().toString(36).slice(2, 6)
}

export default function SignupPage() {
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください')
      return
    }
    if (!orgName.trim()) {
      setError('会社名・チーム名を入力してください')
      return
    }

    setLoading(true)

    // 1. Supabase Auth でユーザー作成
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError || !authData.user) {
      setError(authError?.message || 'アカウント作成に失敗しました')
      setLoading(false)
      return
    }

    // 2. 組織作成（API Route 経由で service role を使用）
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: authData.user.id,
        orgName: orgName.trim(),
        slug: generateSlug(orgName),
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || '組織の作成に失敗しました')
      setLoading(false)
      return
    }

    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ORIGIN SALES REPORTING" className="h-14 w-auto mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold">新規登録（組織作成）</h1>
          <p className="text-slate-400 text-sm mt-1">14日間無料でご利用いただけます</p>
        </div>

        <form onSubmit={handleSignup} className="bg-slate-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-slate-400 text-xs font-semibold mb-1.5">会社名・チーム名</label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              required
              className="w-full bg-slate-700 text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600"
              placeholder="株式会社〇〇 営業部"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs font-semibold mb-1.5">メールアドレス（管理者）</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-slate-700 text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs font-semibold mb-1.5">パスワード（8文字以上）</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-slate-700 text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 border border-slate-600"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl py-3 transition-colors"
          >
            {loading ? '登録中...' : '無料で始める'}
          </button>

          <p className="text-slate-500 text-xs text-center">
            登録することで利用規約とプライバシーポリシーに同意したものとみなします
          </p>
        </form>

        <p className="text-center text-slate-500 text-sm mt-4">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-semibold">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
