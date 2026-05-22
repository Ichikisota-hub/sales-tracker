'use client'

import { useState } from 'react'
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

const ORGS = [
  { slug: 'origin', label: 'ORIGIN' },
  { slug: 'top',    label: 'TOP' },
]

export default function SignupPage() {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [orgSlug,  setOrgSlug]  = useState<'origin' | 'top'>('origin')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/self-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, orgSlug }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '登録に失敗しました')
        return
      }
      window.location.href = '/'
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
  }
  const focusIn  = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = 'rgba(99,102,241,0.6)'; e.target.style.background = 'rgba(99,102,241,0.06)' }
  const focusOut = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.06)' }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0c1220 0%, #0f172a 60%, #111827 100%)' }}>

      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.10) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ORIGIN SALES REPORTING" className="h-14 w-auto mx-auto mb-5" />
          <p className="text-slate-500 text-sm">新規アカウント登録</p>
        </div>

        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                   backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                   boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 text-red-400 text-sm rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            {/* 代理店選択 */}
            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1.5 tracking-wide">代理店</label>
              <div className="flex gap-2">
                {ORGS.map(org => (
                  <button
                    key={org.slug}
                    type="button"
                    onClick={() => setOrgSlug(org.slug as 'origin' | 'top')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={orgSlug === org.slug
                      ? { background: 'linear-gradient(135deg,#6366f1,#2563eb)', color: 'white' }
                      : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
                  >{org.label}</button>
                ))}
              </div>
            </div>

            {/* 名前 */}
            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1.5 tracking-wide">お名前</label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none transition-all"
                  style={inputStyle} onFocus={focusIn} onBlur={focusOut} placeholder="山田 太郎" />
              </div>
            </div>

            {/* メール */}
            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1.5 tracking-wide">メールアドレス</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none transition-all"
                  style={inputStyle} onFocus={focusIn} onBlur={focusOut} placeholder="you@example.com" />
              </div>
            </div>

            {/* パスワード */}
            <div>
              <label className="block text-slate-400 text-xs font-semibold mb-1.5 tracking-wide">パスワード（6文字以上）</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  className="w-full text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none transition-all"
                  style={inputStyle} onFocus={focusIn} onBlur={focusOut} placeholder="••••••••" />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white font-bold text-sm rounded-xl py-3.5 transition-all mt-2 disabled:opacity-50"
              style={{ background: loading ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg,#6366f1,#2563eb)',
                       boxShadow: loading ? 'none' : '0 6px 20px rgba(99,102,241,0.4)' }}>
              {loading
                ? <><Loader2 size={16} className="animate-spin" /><span>登録中...</span></>
                : <><span>アカウント作成</span><ArrowRight size={16} /></>}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-sm mt-5">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 underline transition-colors">
            こちらからログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
