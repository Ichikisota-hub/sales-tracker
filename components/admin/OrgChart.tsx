'use client'

import { useEffect, useState } from 'react'
import { supabase, Team, SalesRep } from '@/lib/supabase'
import { Building2, Save } from 'lucide-react'

type Props = { organizationId: string }

interface TeamWithLeader extends Team {
  leader_sales_rep_id: string | null
  description: string | null
}

export default function OrgChart({ organizationId }: Props) {
  const [teams, setTeams] = useState<TeamWithLeader[]>([])
  const [reps, setReps] = useState<SalesRep[]>([])
  const [edits, setEdits] = useState<Record<string, { leaderId: string; description: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('teams').select('*').eq('organization_id', organizationId).order('display_order')
      .then(({ data }) => {
        const t = (data ?? []) as TeamWithLeader[]
        setTeams(t)
        const init: typeof edits = {}
        t.forEach(team => {
          init[team.id] = {
            leaderId: team.leader_sales_rep_id ?? '',
            description: team.description ?? '',
          }
        })
        setEdits(init)
      })

    supabase.from('sales_reps').select('*').eq('is_active', true).eq('organization_id', organizationId).order('display_order')
      .then(({ data }) => setReps((data ?? []) as SalesRep[]))
  }, [organizationId])

  async function saveTeam(teamId: string) {
    setSaving(teamId)
    const e = edits[teamId]
    await supabase.from('teams').update({
      leader_sales_rep_id: e.leaderId || null,
      description: e.description || null,
    }).eq('id', teamId)
    setSaving(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 size={16} className="text-blue-600" />
        <h3 className="font-bold text-sm text-slate-800">代理店・チーム組織図</h3>
      </div>

      {teams.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">チームがありません</p>
      ) : (
        <div className="space-y-2">
          {teams.map(team => {
            const e = edits[team.id] ?? { leaderId: '', description: '' }
            const leader = reps.find(r => r.id === e.leaderId)
            const members = reps.filter(r => r.team_id === team.id)

            return (
              <div key={team.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{team.name}</p>
                    <p className="text-xs text-slate-400">{members.length}名</p>
                  </div>
                  <button
                    onClick={() => saveTeam(team.id)}
                    disabled={saving === team.id}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"
                  >
                    <Save size={12} />
                    {saving === team.id ? '保存中…' : '保存'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">責任者（申請通知を受け取る）</label>
                    <select
                      value={e.leaderId}
                      onChange={ev => setEdits(prev => ({ ...prev, [team.id]: { ...prev[team.id], leaderId: ev.target.value } }))}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="">未設定</option>
                      {reps.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    {leader && !(leader as any).line_user_id && (
                      <p className="text-xs text-red-500 mt-0.5">⚠️ {leader.name}のLINE IDが未設定のため通知できません</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1">チームの説明（任意）</label>
                    <input
                      type="text"
                      value={e.description}
                      onChange={ev => setEdits(prev => ({ ...prev, [team.id]: { ...prev[team.id], description: ev.target.value } }))}
                      placeholder="例: 大阪北エリア担当"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                {/* メンバー一覧 */}
                <div className="flex flex-wrap gap-1.5">
                  {members.map(r => (
                    <span key={r.id}
                      className={`text-xs px-2 py-0.5 rounded-full ${r.id === e.leaderId ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-slate-100 text-slate-600'}`}>
                      {r.id === e.leaderId ? '👑 ' : ''}{r.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
