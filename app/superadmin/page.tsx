'use client'

import { useEffect, useState } from 'react'

const SUPERADMIN_KEY = 'Origin0201'
const STORAGE_KEY = 'superadmin_unlocked'

interface Org {
  id: string
  name: string
  slug: string
  plan: string
  trial_ends_at: string | null
  max_members: number
  is_active: boolean
  created_at: string
  member_count: number
}

interface EditState {
  plan: string
  max_members: number
  is_active: boolean
  trial_ends_at: string
}

export default function SuperAdminPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      setUnlocked(true)
    }
  }, [])

  useEffect(() => {
    if (unlocked) loadOrgs()
  }, [unlocked])

  async function loadOrgs() {
    setLoading(true)
    const res = await fetch('/api/superadmin/orgs', {
      headers: { 'x-superadmin-key': SUPERADMIN_KEY },
    })
    if (res.ok) {
      setOrgs(await res.json())
    }
    setLoading(false)
  }

  function handleLogin() {
    if (password === SUPERADMIN_KEY) {
      localStorage.setItem(STORAGE_KEY, 'true')
      setUnlocked(true)
      setPasswordError(false)
    } else {
      setPasswordError(true)
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setUnlocked(false)
    setPassword('')
    setOrgs([])
  }

  function startEdit(org: Org) {
    setEditingId(org.id)
    setEditState({
      plan: org.plan,
      max_members: org.max_members,
      is_active: org.is_active,
      trial_ends_at: org.trial_ends_at?.slice(0, 10) || '',
    })
    setSaveError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
    setSaveError('')
  }

  async function saveEdit(id: string) {
    if (!editState) return
    setSaving(true)
    setSaveError('')
    const res = await fetch('/api/superadmin/orgs', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-superadmin-key': SUPERADMIN_KEY,
      },
      body: JSON.stringify({
        id,
        plan: editState.plan,
        max_members: Number(editState.max_members),
        is_active: editState.is_active,
        trial_ends_at: editState.trial_ends_at || null,
      }),
    })
    if (res.ok) {
      await loadOrgs()
      setEditingId(null)
      setEditState(null)
    } else {
      const data = await res.json()
      setSaveError(data.error || '保存に失敗しました')
    }
    setSaving(false)
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🔐</div>
            <h1 className="text-white font-bold text-lg">システム管理</h1>
            <p className="text-slate-400 text-sm mt-1">ORIGIN Sales Tracker</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setPasswordError(false) }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="管理者パスワード"
              className={`w-full bg-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 ${
                passwordError ? 'ring-2 ring-red-500' : 'focus:ring-blue-500'
              }`}
            />
            {passwordError && (
              <p className="text-red-400 text-xs">パスワードが正しくありません</p>
            )}
            <button
              onClick={handleLogin}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition-colors"
            >
              ログイン
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* ヘッダー */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">🔐 システム管理</h1>
          <p className="text-slate-400 text-xs mt-0.5">ORIGIN Sales Tracker — 全組織管理</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-slate-400 hover:text-white text-sm transition-colors"
        >
          ログアウト
        </button>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {/* サマリー */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">総組織数</div>
            <div className="text-2xl font-bold">{orgs.length}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">有効組織</div>
            <div className="text-2xl font-bold text-green-400">
              {orgs.filter(o => o.is_active).length}
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">総メンバー数</div>
            <div className="text-2xl font-bold text-blue-400">
              {orgs.reduce((s, o) => s + o.member_count, 0)}
            </div>
          </div>
        </div>

        {/* 組織一覧 */}
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="font-bold">組織一覧</h2>
            <button
              onClick={loadOrgs}
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              ↻ 更新
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">読み込み中...</div>
          ) : orgs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">組織が見つかりません</div>
          ) : (
            <div className="divide-y divide-slate-700">
              {orgs.map(org => (
                <div key={org.id}>
                  {/* 通常行 */}
                  <div className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white truncate">{org.name}</span>
                        <span className="text-slate-500 text-xs">@{org.slug}</span>
                        {!org.is_active && (
                          <span className="bg-red-900 text-red-300 text-xs px-2 py-0.5 rounded-full">停止中</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className={`font-bold ${org.plan === 'trial' ? 'text-amber-400' : 'text-green-400'}`}>
                          {org.plan === 'trial' ? 'トライアル' : org.plan}
                        </span>
                        <span>{org.member_count} / {org.max_members} 名</span>
                        {org.trial_ends_at && (
                          <span>期限: {org.trial_ends_at.slice(0, 10)}</span>
                        )}
                        <span>登録: {org.created_at.slice(0, 10)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => editingId === org.id ? cancelEdit() : startEdit(org)}
                      className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                    >
                      {editingId === org.id ? 'キャンセル' : '編集'}
                    </button>
                  </div>

                  {/* 編集パネル */}
                  {editingId === org.id && editState && (
                    <div className="bg-slate-750 border-t border-slate-700 px-5 py-4 bg-slate-900">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">プラン</label>
                          <select
                            value={editState.plan}
                            onChange={e => setEditState({ ...editState, plan: e.target.value })}
                            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="trial">trial（トライアル）</option>
                            <option value="paid">paid（有料）</option>
                            <option value="free">free（無料）</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">メンバー上限</label>
                          <input
                            type="number"
                            value={editState.max_members}
                            onChange={e => setEditState({ ...editState, max_members: Number(e.target.value) })}
                            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">トライアル期限</label>
                          <input
                            type="date"
                            value={editState.trial_ends_at}
                            onChange={e => setEditState({ ...editState, trial_ends_at: e.target.value })}
                            className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editState.is_active}
                              onChange={e => setEditState({ ...editState, is_active: e.target.checked })}
                              className="w-4 h-4 accent-blue-500"
                            />
                            <span className="text-sm text-slate-300">有効（利用可）</span>
                          </label>
                        </div>
                      </div>
                      {saveError && (
                        <p className="text-red-400 text-xs mb-3">{saveError}</p>
                      )}
                      <button
                        onClick={() => saveEdit(org.id)}
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
                      >
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
