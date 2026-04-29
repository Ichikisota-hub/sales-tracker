'use client'

import { useEffect, useState } from 'react'
import { useOrganization } from '@/contexts/OrganizationContext'
import { SalesRep } from '@/lib/supabase'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  onInvited: () => void
}

export default function InviteForm({ onInvited }: Props) {
  const { organizationId } = useOrganization()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'manager' | 'admin'>('member')
  const [repId, setRepId] = useState<string>('')
  const [reps, setReps] = useState<SalesRep[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  useEffect(() => {
    if (!organizationId) return
    supabase
      .from('sales_reps')
      .select('*')
      .eq('is_active', true)
      .eq('organization_id', organizationId)
      .order('display_order')
      .then(({ data }: { data: import('@/lib/supabase').SalesRep[] | null }) => setReps(data ?? []))
  }, [organizationId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInviteUrl('')
    setLoading(true)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        role,
        organizationId,
        ...(repId ? { repId } : {}),
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || '招待の送信に失敗しました')
      return
    }

    setInviteUrl(data.inviteUrl || '')
    setEmail('')
    setRepId('')
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

        {/* メール + ロール */}
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="メールアドレス"
            className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={role}
            onChange={e => { setRole(e.target.value as 'member' | 'manager' | 'admin'); setRepId('') }}
            className="border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="member">メンバー</option>
            <option value="manager">マネージャー</option>
            <option value="admin">管理者</option>
          </select>
        </div>

        {/* 担当者選択（member のみ） */}
        {role === 'member' && reps.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">担当者を紐付け（任意）</label>
            <select
              value={repId}
              onChange={e => setRepId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">担当者なし</option>
              {reps.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !organizationId}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? '送信中...' : '招待リンクを発行'}
        </button>
      </form>
    </div>
  )
}
