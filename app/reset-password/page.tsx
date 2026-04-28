'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // URLのハッシュ/クエリからセッションを復元する（バックグラウンド）
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {})
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('6文字以上で入力してください'); return }
    if (password !== confirm) { setError('パスワードが一致しません'); return }
    setError('')
    setLoading(true)

    // セッションを最新化してからパスワード更新
    await supabase.auth.getSession()
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) {
      if (err.message.includes('session') || err.message.includes('token') || err.message.includes('expired')) {
        setError('リンクの有効期限が切れています。管理者に新しいリンクを発行してもらってください。')
      } else {
        setError(err.message)
      }
    } else {
      setDone(true)
      setTimeout(() => router.push('/'), 2500)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#0c1220,#0f172a)' }}>
        <div className="text-center space-y-4">
          <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
          <p className="text-white font-bold text-lg">パスワードを設定しました</p>
          <p className="text-slate-400 text-sm">アプリへ移動します...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(160deg,#0c1220,#0f172a)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="logo" className="h-12 w-auto mx-auto mb-4 opacity-90" />
          <h1 className="text-white font-bold text-xl">パスワードを設定</h1>
          <p className="text-slate-400 text-sm mt-1">新しいパスワードを入力してください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="新しいパスワード（6文字以上）"
              required
              className="w-full bg-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="パスワード（確認）"
              required
              className="w-full bg-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? '設定中...' : 'パスワードを設定する'}
          </button>
        </form>
      </div>
    </div>
  )
}
