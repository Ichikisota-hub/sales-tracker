'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { Lock, Mail, User, Building2, Loader2, CheckCircle } from 'lucide-react'

// 招待リンクのURLハッシュをモジュール評価時に即時キャプチャ
const INITIAL_HASH = typeof window !== 'undefined' ? window.location.hash : ''

// JWTから招待先組織IDを取得
function getInvitedOrgId(hash: string): string | null {
  try {
    const params = new URLSearchParams(hash.substring(1))
    const token = params.get('access_token')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.user_metadata?.invited_to_org || null
  } catch { return null }
}

const INVITED_ORG_ID = getInvitedOrgId(INITIAL_HASH)

interface Org { id: string; name: string }

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [orgs, setOrgs] = useState<Org[]>([])
  const [agency, setAgency] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // 組織一覧を取得し、招待先組織に絞り込む
  useEffect(() => {
    fetch('/api/public/orgs')
      .then(r => r.json())
      .then((data: Org[]) => {
        const all = data ?? []
        if (INVITED_ORG_ID) {
          // 招待先組織のみ表示し、自動選択
          const matched = all.filter(o => o.id === INVITED_ORG_ID)
          setOrgs(matched)
          if (matched.length === 1) setAgency(matched[0].name)
        } else {
          setOrgs(all)
        }
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('メールアドレスを入力してください'); return }
    if (!agency) { setError('代理店を選択してください'); return }
    if (!fullName.trim()) { setError('名前を入力してください'); return }
    if (password.length < 6) { setError('パスワードは6文字以上で入力してください'); return }
    if (password !== confirm) { setError('パスワードが一致しません'); return }
    setError('')
    setLoading(true)

    // 招待トークンがある場合は必ず優先してセッションを確立（管理者セッションを上書き）
    if (INITIAL_HASH) {
      const params = new URLSearchParams(INITIAL_HASH.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (accessToken && refreshToken) {
        const { error: sessionErr } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (sessionErr) {
          setLoading(false)
          setError('リンクの有効期限が切れています。管理者に新しいリンクを発行してもらってください。')
          return
        }
      }
    }

    // セッションが確立されているか確認
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      setError('セッションが確立できませんでした。管理者に新しいリンクを発行してもらってください。')
      return
    }

    const { error: err, data: updateData } = await supabase.auth.updateUser({
      password,
      data: {
        full_name: fullName.trim(),
        agency,
      },
    })

    if (err) {
      setLoading(false)
      if (err.message.includes('session') || err.message.includes('token') || err.message.includes('expired')) {
        setError('リンクの有効期限が切れています。管理者に新しいリンクを発行してもらってください。')
      } else {
        setError(err.message)
      }
      return
    }

    // 名前と一致するsales_repを自動紐付け
    const accessToken = updateData.user
      ? (await supabase.auth.getSession()).data.session?.access_token
      : null
    if (accessToken) {
      await fetch('/api/auth/link-rep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ fullName: fullName.trim() }),
      }).catch(() => {})
    }

    setLoading(false)
    setDone(true)
    setTimeout(() => router.push('/'), 2500)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#0c1220,#0f172a)' }}>
        <div className="text-center space-y-4">
          <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto" />
          <p className="text-white font-bold text-lg">アカウントを設定しました</p>
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
          <h1 className="text-white font-bold text-xl">アカウント設定</h1>
          <p className="text-slate-400 text-sm mt-1">情報を入力してアカウントを有効化してください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* メールアドレス（手入力） */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="招待されたメールアドレス"
              required
              className="w-full bg-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700 placeholder:text-slate-500"
            />
          </div>

          {/* 代理店（招待先が確定している場合は固定表示） */}
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            {orgs.length === 1 ? (
              <input
                type="text"
                value={orgs[0].name}
                readOnly
                className="w-full bg-slate-700/50 text-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm border border-slate-600 cursor-default"
              />
            ) : (
              <select
                value={agency}
                onChange={e => setAgency(e.target.value)}
                required
                className="w-full bg-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700 appearance-none"
              >
                <option value="">代理店を選択</option>
                {orgs.map(o => (
                  <option key={o.id} value={o.name}>{o.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* 名前 */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="名前"
              required
              className="w-full bg-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700 placeholder:text-slate-500"
            />
          </div>

          <div className="border-t border-slate-700/50 pt-1" />

          {/* パスワード */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="パスワード（6文字以上）"
              required
              className="w-full bg-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700 placeholder:text-slate-500"
            />
          </div>

          {/* パスワード確認 */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="パスワード（確認）"
              required
              className="w-full bg-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-slate-700 placeholder:text-slate-500"
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
            {loading ? '設定中...' : 'アカウントを有効化する'}
          </button>
        </form>
      </div>
    </div>
  )
}
