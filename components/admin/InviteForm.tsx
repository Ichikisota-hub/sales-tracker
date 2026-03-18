'use client'

import { useState } from 'react'

type Props = {
  onInvited: () => void
}

export default function InviteForm({ onInvited }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'manager' | 'admin'>('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInviteUrl('')
    setLoading(true)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || '招待の送信に失敗しました')
      return
    }

    setInviteUrl(data.inviteUrl)
    setEmail('')
    onInvited()
  }

  async function copyUrl() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      alert('招待リンクをコピーしました')
    } catch {
      prompt('招待リンクをコピーしてください:', inviteUrl)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="font-bold text-sm text-slate-800 mb-3">メンバーを招待</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {inviteUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-green-700 text-xs font-bold mb-1">招待リンクを作成しました</p>
            <div className="flex gap-2 items-center">
              <p className="text-green-600 text-xs break-all flex-1">{inviteUrl}</p>
              <button type="button" onClick={copyUrl}
                className="bg-green-600 text-white text-xs px-2 py-1 rounded font-bold shrink-0">
                コピー
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="メールアドレス"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as any)}
            className="border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="member">メンバー</option>
            <option value="manager">マネージャー</option>
            <option value="admin">管理者</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {loading ? '送信中...' : '招待'}
          </button>
        </div>
      </form>
    </div>
  )
}
