'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Team } from '@/lib/supabase'

type Props = { reps: SalesRep[]; onUpdate: () => void }

export default function RepSettings({ reps, onUpdate }: Props) {
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [inactiveReps, setInactiveReps] = useState<SalesRep[]>([])
  const [showInactive, setShowInactive] = useState(false)

  const [teams, setTeams] = useState<Team[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [addingTeam, setAddingTeam] = useState(false)
  const [deleteTeamConfirm, setDeleteTeamConfirm] = useState<string | null>(null)
  const [editingTeam, setEditingTeam] = useState<Record<string, string>>({})
  const [savingTeam, setSavingTeam] = useState(false)
  const [savedTeam, setSavedTeam] = useState(false)
  const [repTeamEditing, setRepTeamEditing] = useState<Record<string, string | null>>({})
  const [savingRepTeam, setSavingRepTeam] = useState(false)
  const [savedRepTeam, setSavedRepTeam] = useState(false)

  type RepLinkStatus = { linked: boolean; pendingEmail: string | null; pendingToken: string | null }
  const [linkStatuses, setLinkStatuses] = useState<Record<string, RepLinkStatus>>({})
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({})
  const [inviting, setInviting] = useState<Record<string, boolean>>({})
  const [inviteResult, setInviteResult] = useState<Record<string, { url: string; error: string }>>({})
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    loadTeams()
    loadInactiveReps()
    supabase.from('organizations').select('id').limit(1).single().then(({ data }) => {
      if (data) setOrgId(data.id)
    })
  }, [])
  useEffect(() => { loadLinkStatuses() }, [reps])

  async function loadTeams() {
    const { data } = await supabase.from('teams').select('*').order('display_order')
    setTeams(data || [])
  }

  async function loadLinkStatuses() {
    const repIds = reps.map(r => r.id)
    if (repIds.length === 0) return
    setLoadingLinks(true)
    const [{ data: members }, { data: pending }] = await Promise.all([
      supabase.from('organization_members').select('sales_rep_id').in('sales_rep_id', repIds),
      supabase.from('invitations').select('rep_id, email, token, expires_at')
        .in('rep_id', repIds)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString()),
    ])
    const linkedSet = new Set((members || []).map(m => m.sales_rep_id))
    const pendingMap: Record<string, { email: string; token: string }> = {}
    for (const inv of (pending || [])) {
      if (inv.rep_id) pendingMap[inv.rep_id] = { email: inv.email, token: inv.token }
    }
    const statuses: Record<string, RepLinkStatus> = {}
    for (const rep of reps) {
      statuses[rep.id] = {
        linked: linkedSet.has(rep.id),
        pendingEmail: pendingMap[rep.id]?.email ?? null,
        pendingToken: pendingMap[rep.id]?.token ?? null,
      }
    }
    setLinkStatuses(statuses)
    setLoadingLinks(false)
  }

  async function sendInvite(repId: string) {
    const email = inviteEmail[repId]?.trim()
    if (!email) return
    setInviting(prev => ({ ...prev, [repId]: true }))
    setInviteResult(prev => ({ ...prev, [repId]: { url: '', error: '' } }))
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: 'member', repId, organizationId: orgId }),
    })
    const data = await res.json()
    setInviting(prev => ({ ...prev, [repId]: false }))
    if (!res.ok) {
      setInviteResult(prev => ({ ...prev, [repId]: { url: '', error: data.error || '招待に失敗しました' } }))
    } else {
      setInviteResult(prev => ({ ...prev, [repId]: { url: data.inviteUrl, error: '' } }))
      setInviteEmail(prev => ({ ...prev, [repId]: '' }))
      await loadLinkStatuses()
    }
  }

  async function loadInactiveReps() {
    const { data } = await supabase.from('sales_reps').select('*').eq('is_active', false).order('display_order')
    setInactiveReps(data || [])
  }

  function handleChange(id: string, value: string) {
    setEditing(prev => ({ ...prev, [id]: value }))
    setSaved(false)
  }

  async function saveAll() {
    setSaving(true)
    for (const [id, name] of Object.entries(editing)) {
      if (name.trim()) {
        await supabase.from('sales_reps').update({ name: name.trim() }).eq('id', id)
      }
    }
    setSaving(false)
    setSaved(true)
    setEditing({})
    onUpdate()
    setTimeout(() => setSaved(false), 2000)
  }

  async function addRep() {
    if (!newName.trim()) return
    setAdding(true)
    const maxOrder = reps.length > 0 ? Math.max(...reps.map(r => r.display_order)) : 0
    await supabase.from('sales_reps').insert({
      name: newName.trim(),
      display_order: maxOrder + 1,
    })
    setNewName('')
    setAdding(false)
    onUpdate()
  }

  async function deleteRep(id: string) {
    await supabase.from('sales_reps').update({ is_active: false }).eq('id', id)
    setDeleteConfirm(null)
    onUpdate()
    loadInactiveReps()
  }

  async function restoreRep(id: string) {
    await supabase.from('sales_reps').update({ is_active: true }).eq('id', id)
    onUpdate()
    loadInactiveReps()
  }

  async function addTeam() {
    if (!newTeamName.trim()) return
    setAddingTeam(true)
    const maxOrder = teams.length > 0 ? Math.max(...teams.map(t => t.display_order)) : 0
    await supabase.from('teams').insert({ name: newTeamName.trim(), display_order: maxOrder + 1 })
    setNewTeamName('')
    setAddingTeam(false)
    await loadTeams()
  }

  async function deleteTeam(id: string) {
    await supabase.from('teams').delete().eq('id', id)
    setDeleteTeamConfirm(null)
    await loadTeams()
    onUpdate()
  }

  async function saveTeams() {
    setSavingTeam(true)
    for (const [id, name] of Object.entries(editingTeam)) {
      if (name.trim()) {
        await supabase.from('teams').update({ name: name.trim() }).eq('id', id)
      }
    }
    setSavingTeam(false)
    setSavedTeam(true)
    setEditingTeam({})
    await loadTeams()
    setTimeout(() => setSavedTeam(false), 2000)
  }

  async function saveRepTeams() {
    setSavingRepTeam(true)
    for (const [repId, teamId] of Object.entries(repTeamEditing)) {
      await supabase.from('sales_reps').update({ team_id: teamId || null }).eq('id', repId)
    }
    setSavingRepTeam(false)
    setSavedRepTeam(true)
    setRepTeamEditing({})
    onUpdate()
    setTimeout(() => setSavedRepTeam(false), 2000)
  }

  return (
    <div className="max-w-md space-y-4">

      {/* チーム管理 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-bold text-sm mb-1 text-gray-800">チーム管理</h2>
        <p className="text-xs text-gray-400 mb-3">チームを作成・編集・削除できます</p>

        <div className="space-y-2 mb-3">
          {teams.map(team => (
            <div key={team.id} className="flex items-center gap-2">
              <input
                type="text"
                value={editingTeam[team.id] !== undefined ? editingTeam[team.id] : team.name}
                onChange={e => {
                  setEditingTeam(prev => ({ ...prev, [team.id]: e.target.value }))
                  setSavedTeam(false)
                }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:border-blue-400"
              />
              {deleteTeamConfirm === team.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => deleteTeam(team.id)}
                    className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg font-medium hover:bg-red-600"
                  >削除</button>
                  <button
                    onClick={() => setDeleteTeamConfirm(null)}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200"
                  >戻る</button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteTeamConfirm(team.id)}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1 font-bold text-lg leading-none"
                  title="削除"
                >×</button>
              )}
            </div>
          ))}
          {teams.length === 0 && <p className="text-xs text-gray-400">チームがまだありません</p>}
        </div>

        {teams.length > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={saveTeams}
              disabled={savingTeam || Object.keys(editingTeam).length === 0}
              className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingTeam ? '保存中...' : '💾 保存'}
            </button>
            {savedTeam && <span className="text-green-600 text-xs font-medium">✓ 保存しました</span>}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTeam()}
            placeholder="新しいチーム名..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={addTeam}
            disabled={addingTeam || !newTeamName.trim()}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {addingTeam ? '追加中...' : '＋ 追加'}
          </button>
        </div>
      </div>

      {/* チーム割り当て */}
      {teams.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="font-bold text-sm mb-1 text-gray-800">チーム割り当て</h2>
          <p className="text-xs text-gray-400 mb-3">各担当者のチームを設定してください</p>

          <div className="space-y-2 mb-4">
            {reps.map(rep => {
              const currentTeamId = repTeamEditing[rep.id] !== undefined
                ? repTeamEditing[rep.id]
                : (rep.team_id ?? '')
              return (
                <div key={rep.id} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{rep.name}</span>
                  <select
                    value={currentTeamId ?? ''}
                    onChange={e => setRepTeamEditing(prev => ({ ...prev, [rep.id]: e.target.value || null }))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                  >
                    <option value="">未所属</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveRepTeams}
              disabled={savingRepTeam || Object.keys(repTeamEditing).length === 0}
              className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingRepTeam ? '保存中...' : '💾 保存'}
            </button>
            {savedRepTeam && <span className="text-green-600 text-xs font-medium">✓ 保存しました</span>}
            {Object.keys(repTeamEditing).length > 0 && !savingRepTeam && (
              <span className="text-orange-500 text-xs">{Object.keys(repTeamEditing).length}件の変更あり</span>
            )}
          </div>
        </div>
      )}

      {/* 担当者一覧・編集 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-bold text-sm mb-1 text-gray-800">担当者一覧</h2>
        <p className="text-xs text-gray-400 mb-3">名前を編集して「保存」を押してください</p>

        <div className="space-y-2 mb-4">
          {reps.map((rep, i) => (
            <div key={rep.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
              <input
                type="text"
                value={editing[rep.id] !== undefined ? editing[rep.id] : rep.name}
                onChange={e => handleChange(rep.id, e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:border-blue-400"
                placeholder={`担当者${i + 1}`}
              />
              {deleteConfirm === rep.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => deleteRep(rep.id)}
                    className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg font-medium hover:bg-red-600"
                  >削除</button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200"
                  >戻る</button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(rep.id)}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1 font-bold text-lg leading-none"
                  title="削除"
                >×</button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveAll}
            disabled={saving || Object.keys(editing).length === 0}
            className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '保存中...' : '💾 保存'}
          </button>
          {saved && <span className="text-green-600 text-xs font-medium">✓ 保存しました</span>}
          {Object.keys(editing).length > 0 && !saving && (
            <span className="text-orange-500 text-xs">{Object.keys(editing).length}件の変更あり</span>
          )}
        </div>
      </div>

      {/* メールアドレス・招待 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-bold text-sm mb-1 text-gray-800">メールアドレス・招待</h2>
        <p className="text-xs text-gray-400 mb-3">担当者ごとにメールアドレスを紐付けます。招待リンクを発行して共有してください。</p>
        {loadingLinks ? (
          <p className="text-xs text-gray-400">読み込み中...</p>
        ) : (
          <div className="space-y-3">
            {reps.map(rep => {
              const status = linkStatuses[rep.id]
              const result = inviteResult[rep.id]
              const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
              return (
                <div key={rep.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 flex-1">{rep.name}</span>
                    {status?.linked ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ 連携済み</span>
                    ) : status?.pendingEmail ? (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">招待中</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">未連携</span>
                    )}
                  </div>
                  {status?.linked ? (
                    <p className="text-xs text-gray-400">ユーザーアカウントと連携されています。</p>
                  ) : status?.pendingEmail ? (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">招待中: <span className="font-medium">{status.pendingEmail}</span></p>
                      {status.pendingToken && (
                        <div className="flex gap-2 items-center">
                          <p className="text-xs text-gray-400 break-all flex-1 truncate">{appUrl}/invite/{status.pendingToken}</p>
                          <button type="button" onClick={async () => {
                            const url = `${appUrl}/invite/${status.pendingToken}`
                            try { await navigator.clipboard.writeText(url); alert('コピーしました') }
                            catch { prompt('招待リンク:', url) }
                          }} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-medium hover:bg-gray-200 shrink-0">コピー</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {result?.error && <p className="text-xs text-red-500">{result.error}</p>}
                      {result?.url && (
                        <div className="flex gap-2 items-center">
                          <p className="text-xs text-green-600 break-all flex-1 truncate">{result.url}</p>
                          <button type="button" onClick={async () => {
                            try { await navigator.clipboard.writeText(result.url); alert('コピーしました') }
                            catch { prompt('招待リンク:', result.url) }
                          }} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium hover:bg-green-200 shrink-0">コピー</button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={inviteEmail[rep.id] || ''}
                          onChange={e => setInviteEmail(prev => ({ ...prev, [rep.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && sendInvite(rep.id)}
                          placeholder="メールアドレスを入力..."
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs flex-1 focus:outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={() => sendInvite(rep.id)}
                          disabled={inviting[rep.id] || !inviteEmail[rep.id]?.trim() || !orgId}
                          className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >{inviting[rep.id] ? '送信中...' : '招待'}</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 担当者追加 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-bold text-sm mb-1 text-gray-800">担当者を追加</h2>
        <p className="text-xs text-gray-400 mb-3">新しい担当者名を入力してください</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRep()}
            placeholder="担当者名を入力..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={addRep}
            disabled={adding || !newName.trim()}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {adding ? '追加中...' : '＋ 追加'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">現在 {reps.length} 名登録中</p>
      </div>

      {/* 非表示の担当者 */}
      {inactiveReps.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <button
            onClick={() => setShowInactive(v => !v)}
            className="flex items-center gap-2 w-full text-left"
          >
            <h2 className="font-bold text-sm text-gray-500">非表示の担当者（{inactiveReps.length}名）</h2>
            <span className="text-xs text-gray-400">{showInactive ? '▲ 閉じる' : '▼ 表示'}</span>
          </button>
          {showInactive && (
            <div className="mt-3 space-y-2">
              {inactiveReps.map(rep => (
                <div key={rep.id} className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 flex-1">{rep.name}</span>
                  <button
                    onClick={() => restoreRep(rep.id)}
                    className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-medium hover:bg-blue-200 transition-colors"
                  >
                    復元
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
