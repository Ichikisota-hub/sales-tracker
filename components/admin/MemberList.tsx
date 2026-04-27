'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { OrganizationMember, SalesRep } from '@/lib/supabase'
import { useOrganization } from '@/contexts/OrganizationContext'
import { Link2, UserCheck, Loader2 } from 'lucide-react'

type MemberWithEmail = OrganizationMember & { email: string }

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  manager: 'マネージャー',
  member: 'メンバー',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-blue-100 text-blue-700',
  member: 'bg-slate-100 text-slate-600',
}

type Props = { refreshKey: number }

export default function MemberList({ refreshKey }: Props) {
  const { organizationId, isAdmin, membership } = useOrganization()
  const [members, setMembers] = useState<MemberWithEmail[]>([])
  const [reps, setReps] = useState<SalesRep[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!organizationId) return
    loadAll()
  }, [organizationId, refreshKey])

  async function loadAll() {
    setLoading(true)
    const [membersRes, repsRes] = await Promise.all([
      fetch(`/api/admin/members?organizationId=${organizationId}`),
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
    ])

    const membersData = await membersRes.json()
    setMembers(membersData.members ?? [])
    setReps(repsRes.data ?? [])
    setLoading(false)
  }

  async function changeRole(memberId: string, newRole: string) {
    await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', memberId)
    loadAll()
  }

  async function changeSalesRep(memberId: string, salesRepId: string) {
    setSavingId(memberId)
    await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, salesRepId: salesRepId || null }),
    })
    setSavingId(null)
    loadAll()
  }

  async function removeMember(memberId: string) {
    if (!confirm('このメンバーを削除しますか？')) return
    await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)
    loadAll()
  }

  if (loading) return <div className="text-slate-400 text-sm py-4">読み込み中...</div>

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <UserCheck size={15} className="text-slate-400" />
        <h3 className="font-bold text-sm text-slate-800">メンバー一覧（{members.length}名）</h3>
      </div>

      {/* ヘッダー行（管理者のみ） */}
      {isAdmin && members.length > 0 && (
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">メールアドレス</span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">担当者紐付け</span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">ロール</span>
          <span />
        </div>
      )}

      <div className="divide-y divide-slate-50">
        {members.map(m => {
          const isMe = m.user_id === membership?.user_id
          const linkedRep = reps.find(r => r.id === m.sales_rep_id)

          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              {/* アバター */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)', color: 'white' }}>
                {(m.email || m.user_id).slice(0, 1).toUpperCase()}
              </div>

              {/* メール + 参加日 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {m.email || m.user_id}
                  {isMe && <span className="ml-1.5 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">自分</span>}
                </p>
                <p className="text-xs text-slate-400">
                  参加: {new Date(m.joined_at).toLocaleDateString('ja-JP')}
                  {linkedRep && (
                    <span className="ml-2 text-indigo-500 font-semibold inline-flex items-center gap-0.5">
                      <Link2 size={10} />
                      {linkedRep.name}
                    </span>
                  )}
                </p>
              </div>

              {/* 担当者紐付けドロップダウン（管理者のみ） */}
              {isAdmin && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {savingId === m.id ? (
                    <Loader2 size={14} className="animate-spin text-indigo-400" />
                  ) : null}
                  <select
                    value={m.sales_rep_id ?? ''}
                    onChange={e => changeSalesRep(m.id, e.target.value)}
                    disabled={savingId === m.id}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none bg-white text-slate-700 max-w-[100px]"
                  >
                    <option value="">未紐付け</option>
                    {reps.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ロールバッジ */}
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLORS[m.role] || 'bg-slate-100'}`}>
                {ROLE_LABELS[m.role] || m.role}
              </span>

              {/* ロール変更 + 削除（管理者のみ、自分以外） */}
              {isAdmin && !isMe && (
                <div className="flex gap-1 flex-shrink-0">
                  <select
                    value={m.role}
                    onChange={e => changeRole(m.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 outline-none"
                  >
                    <option value="member">メンバー</option>
                    <option value="manager">マネージャー</option>
                    <option value="admin">管理者</option>
                  </select>
                  <button
                    onClick={() => removeMember(m.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-bold px-1.5 py-1 rounded hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {members.length === 0 && (
          <p className="text-slate-400 text-sm px-4 py-4">メンバーがいません</p>
        )}
      </div>
    </div>
  )
}
