'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import { Invitation } from '@/lib/supabase'

type InviteState = 'loading' | 'valid' | 'invalid' | 'expired' | 'used'

export default function InvitePage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const supabase = createClient()

  const [state, setState] = useState<InviteState>('loading')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      setOrgName((data as any).organizations?.name || '')
      setEmail(data.email)
      setState('valid')
    }
    checkToken()
  }, [token])

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // まずサインアップを試みる（既存ユーザーならサインイン）
    let userId: string | null = null

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpData?.user) {
      userId = signUpData.user.id
    } else if (signUpError) {
      // 既存ユーザーの場合はサインイン
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError || !signInData.user) {
        setError('認証に失敗しました。パスワードを確認してください。')
        setLoading(false)
        return
      }
      userId = signInData.user.id
    }

    if (!userId) {
      setError('ユーザーの作成に失敗しました')
      setLoading(false)
      return
    }

    // 招待受諾 API を呼び出し
    const res = await fetch('/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, userId }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || '招待の受諾に失敗しました')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">確認中...</p>
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 text-lg font-bold">{messages[state]}</p>
          <p className="text-slate-500 text-sm mt-2">管理者に新しい招待リンクを発行してもらってください</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ORIGIN SALES REPORTING" className="h-14 w-auto mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold">招待を受諾</h1>
          <p className="text-slate-400 text-sm mt-1">
            <span className="text-blue-400 font-semibold">{orgName}</span> に招待されました
          </p>
        </div>

        <form onSubmit={handleAccept} className="bg-slate-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-slate-400 text-xs font-semibold mb-1.5">メールアドレス</label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full bg-slate-700/50 text-slate-400 text-sm rounded-xl px-4 py-3 border border-slate-600 cursor-not-allowed"
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
              placeholder="新しいパスワードを設定"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl py-3 transition-colors"
          >
            {loading ? '参加中...' : '参加する'}
          </button>
        </form>
      </div>
    </div>
  )
}
