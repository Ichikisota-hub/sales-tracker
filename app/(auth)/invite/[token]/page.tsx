'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import { Invitation } from '@/lib/supabase'
import { Lock, User, Building2, Loader2, CheckCircle } from 'lucide-react'

type InviteState = 'loading' | 'valid' | 'invalid' | 'expired' | 'used'

interface Org { id: string; name: string }

export default function InvitePage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const supabase = createClient()

  const [state, setState] = useState<InviteState>('loading')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgId, setOrgId] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [agency, setAgency] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // トークン検証
  useEffect(() => {
    async function checkToken() {
      const { data } = await supabase
        .from('invitations')
        .select('*, organizations(name)')
        .eq('token', token)
        .single()

      if (!data) { setState('invalid'); return }
      if (data.accepted_at) { setState('used'); return }
      if (new Date(data.expires_at) < new Date()) { setState('expired'); return }

      setInvitation(data as Invitation)
      const name = (data as any).organizations?.name || ''
      setOrgName(name)
      setOrgId(data.organization_id)
      setEmail(data.email)
      setState('valid')
    }
    checkToken()
  }, [token])

  // 組織一覧を取得（代理店選択用）
  useEffect(() => {
    fetch('/api/public/orgs')
      .then(r => r.json())
      .then((data: Org[]) => setOrgs(data ?? []))
      .catch(() => {})
  }, [])

  // orgId が確定したら代理店を自動選択
  useEffect(() => {
    if (!orgId || orgs.length === 0) return
    const matched = orgs.find(o => o.id === orgId)
    if (matched) setAgency(matched.name)
  }, [orgId, orgs])

  // invitation の org に絞り込み（1件なら自動固定）
  const displayOrgs = orgId ? orgs.filter(o => o.id === orgId) : orgs

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('名前を入力してください'); return }
    if (password.length < 6) { setError('パスワードは6文字以上で入力してください'); return }
    if (password !== confirm) { setError('パスワードが一致しません'); return }

    setError('')
    setLoading(true)

    // サーバーサイドでアカウント設定（PKCE 不要）
    const res = await fetch('/api/auth/complete-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, fullName: fullName.trim(), agency }),
    })

    const body = await res.json()

    if (!res.ok) {
      setError(body.error || '招待の受諾に失敗しました')
      setLoading(false)
      return
    }

    // サーバー側でユーザー作成完了 → 通常のサインインでセッション確立
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      setError('アカウント設定は完了しましたが、ログインに失敗しました。ログインページからサインインしてください。')
      setLoading(false)
      return
    }

    setLoading(false)
    setDone(true)
    setTimeout(() => { router.push('/'); router.refresh() }, 2000)
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

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#0c1220,#0f172a)' }}>
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (state === 'invalid' || state === 'expired' || state === 'used') {
    const messages = {
      invalid: '招待リンクが無効です',
      expired: '招待リンクの有効期限が切れています',
      used: 'この招待リンクはすでに使用されています',
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(160deg,#0c1220,#0f172a)' }}>
        <div className="text-center">
          <p className="text-red-400 text-lg font-bold">{messages[state]}</p>
          <p className="text-slate-500 text-sm mt-2">管理者に新しい招待リンクを発行してもらってください</p>
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
          <p className="text-slate-400 text-sm mt-1">
            <span className="text-blue-400 font-semibold">{orgName}</span> に招待されました
          </p>
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          {/* メールアドレス（読み取り専用） */}
          <div>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full bg-slate-700/50 text-slate-400 rounded-xl px-4 py-3 text-sm border border-slate-600 cursor-not-allowed"
            />
          </div>

          {/* 代理店（招待先が確定している場合は固定表示） */}
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            {displayOrgs.length === 1 ? (
              <input
                type="text"
                value={displayOrgs[0].name}
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
                {displayOrgs.map(o => (
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
