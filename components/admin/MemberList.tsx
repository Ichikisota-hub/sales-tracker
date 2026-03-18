'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { OrganizationMember } from '@/lib/supabase'
import { useOrganization } from '@/contexts/OrganizationContext'

type MemberWithUser = OrganizationMember & {
  user_email?: string
}

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
  const [members, setMembers] = useState<MemberWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!organizationId) return
    loadMembers()
  }, [organizationId, refreshKey])

  async function loadMembers() {
    setLoading(true)
    const { data } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId!)
      .order('joined_at')
    setMembers((data || []) as MemberWithUser[])
    setLoading(false)
  }

  async function changeRole(memberId: string, newRole: string) {
    await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', memberId)
    loadMembers()
  }

  async function removeMember(memberId: string) {
    if (!confirm('このメンバーを削除しますか？')) return
    await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)
    loadMembers()
  }

  if (loading) return <div className="text-slate-400 text-sm py-4">読み込み中...</div>

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-bold text-sm text-slate-800">メンバー一覧（{members.length}名）</h3>
      </div>
      <div className="divide-y divide-slate-50">
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 text-sm font-bold">
              {m.user_id.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{m.user_id}</p>
              <p className="text-xs text-slate-400">
                参加: {new Date(m.joined_at).toLocaleDateString('ja-JP')}
              </p>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role] || 'bg-slate-100'}`}>
              {ROLE_LABELS[m.role] || m.role}
            </span>
            {isAdmin && m.user_id !== membership?.user_id && (
              <div className="flex gap-1">
                <select
                  value={m.role}
                  onChange={e => changeRole(m.id, e.target.value)}
                  className="text-xs border border-slate-200 rounded px-1.5 py-1 outline-none"
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
        ))}
        {members.length === 0 && (
          <p className="text-slate-400 text-sm px-4 py-4">メンバーがいません</p>
        )}
      </div>
    </div>
  )
}
