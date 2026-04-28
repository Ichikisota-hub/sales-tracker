'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const SUPERADMIN_KEY = 'Origin0201'
const STORAGE_KEY = 'superadmin_unlocked'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  manager: 'マネージャー',
  member: 'メンバー',
}

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

interface Member {
  id: string
  user_id: string
  email: string
  role: string
  joined_at: string
  sales_rep_id: string | null
  email_confirmed: boolean
  last_sign_in_at: string | null
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
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // メンバー管理
  const [membersOrgId, setMembersOrgId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)
  const [resetingMemberId, setResetingMemberId] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<{ id: string; msg: string; ok: boolean; link?: string } | null>(null)
  const [resetLinkCopied, setResetLinkCopied] = useState(false)

  // パスワード直接変更
  const [pwEditId, setPwEditId] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState('')

  // メンバー招待
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 新規組織追加
  const [showAddForm, setShowAddForm] = useState(false)
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', plan: 'trial', max_members: 10, trial_ends_at: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  // superadmin管理
  const [superadminEmails, setSuperadminEmails] = useState<string[]>([])
  const [newSaEmail, setNewSaEmail] = useState('')
  const [saAdding, setSaAdding] = useState(false)
  const [saMsg, setSaMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [showSaPanel, setShowSaPanel] = useState(false)
  const [saInviteLink, setSaInviteLink] = useState<string | null>(null)
  const [saCopied, setSaCopied] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      setUnlocked(true)
    }
  }, [])

  useEffect(() => {
    if (unlocked) {
      loadOrgs()
      loadSuperadmins()
    }
  }, [unlocked])

  async function loadSuperadmins() {
    const res = await fetch('/api/superadmin/admins', { headers: { 'x-superadmin-key': SUPERADMIN_KEY } })
    if (res.ok) setSuperadminEmails((await res.json()).emails || [])
  }

  async function addSuperadmin() {
    if (!newSaEmail.trim()) return
    setSaAdding(true); setSaMsg(null)
    const res = await fetch('/api/superadmin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-key': SUPERADMIN_KEY },
      body: JSON.stringify({ email: newSaEmail.trim() }),
    })
    const d = await res.json()
    setSaMsg({ ok: res.ok, msg: res.ok ? `${newSaEmail} をsuperadminに追加しました` : d.error })
    if (res.ok) {
      setNewSaEmail('')
      setSuperadminEmails(d.emails || [])
      setSaInviteLink(d.inviteLink || null)
      setSaCopied(false)
    }
    setSaAdding(false)
  }

  async function removeSuperadmin(email: string) {
    if (!confirm(`「${email}」のsuperadmin権限を削除しますか？`)) return
    const res = await fetch('/api/superadmin/admins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-key': SUPERADMIN_KEY },
      body: JSON.stringify({ email }),
    })
    const d = await res.json()
    if (res.ok) setSuperadminEmails(d.emails || [])
    else alert(d.error)
  }

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

  async function addOrg() {
    if (!newOrg.name.trim() || !newOrg.slug.trim()) {
      setAddError('組織名とスラッグは必須です')
      return
    }
    setAdding(true)
    setAddError('')
    const res = await fetch('/api/superadmin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-key': SUPERADMIN_KEY },
      body: JSON.stringify({
        name: newOrg.name.trim(),
        slug: newOrg.slug.trim(),
        plan: newOrg.plan,
        max_members: Number(newOrg.max_members),
        trial_ends_at: newOrg.trial_ends_at || null,
      }),
    })
    if (res.ok) {
      setNewOrg({ name: '', slug: '', plan: 'trial', max_members: 10, trial_ends_at: '' })
      setShowAddForm(false)
      await loadOrgs()
    } else {
      const data = await res.json()
      setAddError(data.error || '作成に失敗しました')
    }
    setAdding(false)
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
    setMembersOrgId(null)
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

  async function deleteOrg(org: Org) {
    if (!confirm(`「${org.name}」を削除しますか？\nメンバーデータも全て削除されます。この操作は取り消せません。`)) return
    setDeletingId(org.id)
    const res = await fetch('/api/superadmin/orgs', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-superadmin-key': SUPERADMIN_KEY,
      },
      body: JSON.stringify({ id: org.id }),
    })
    if (!res.ok) {
      const data = await res.json()
      alert(`削除失敗: ${data.error}`)
    } else {
      await loadOrgs()
      if (membersOrgId === org.id) setMembersOrgId(null)
      if (editingId === org.id) { setEditingId(null); setEditState(null) }
    }
    setDeletingId(null)
  }

  async function toggleMembers(orgId: string) {
    if (membersOrgId === orgId) {
      setMembersOrgId(null)
      setMembers([])
      return
    }
    setMembersOrgId(orgId)
    setEditingId(null)
    setEditState(null)
    setMembersLoading(true)
    const res = await fetch(`/api/superadmin/members?orgId=${orgId}`, {
      headers: { 'x-superadmin-key': SUPERADMIN_KEY },
    })
    if (res.ok) setMembers(await res.json())
    setMembersLoading(false)
  }

  async function deleteMember(member: Member) {
    if (!confirm(`「${member.email}」をこの組織から削除しますか？`)) return
    setDeletingMemberId(member.id)
    const res = await fetch('/api/superadmin/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-key': SUPERADMIN_KEY },
      body: JSON.stringify({ memberId: member.id }),
    })
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== member.id))
      setOrgs(prev => prev.map(o =>
        o.id === membersOrgId ? { ...o, member_count: Math.max(0, o.member_count - 1) } : o
      ))
    } else {
      const data = await res.json()
      alert(`削除失敗: ${data.error}`)
    }
    setDeletingMemberId(null)
  }

  async function sendPasswordReset(member: Member) {
    setResetingMemberId(member.id)
    setResetMsg(null)
    const res = await fetch('/api/superadmin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-key': SUPERADMIN_KEY },
      body: JSON.stringify({ userId: member.user_id }),
    })
    const d = await res.json()
    setResetMsg({ id: member.id, msg: d.message || d.error, ok: res.ok, link: d.resetLink || undefined })
    setResetLinkCopied(false)
    setResetingMemberId(null)
  }

  async function changePassword(member: Member) {
    if (!newPw || newPw.length < 6) { setPwMsg('6文字以上で入力してください'); return }
    setPwSaving(true)
    setPwMsg('')
    const res = await fetch('/api/superadmin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-key': SUPERADMIN_KEY },
      body: JSON.stringify({ userId: member.user_id, newPassword: newPw }),
    })
    const d = await res.json()
    setPwMsg(d.message || d.error)
    setPwSaving(false)
    if (res.ok) { setNewPw(''); setTimeout(() => { setPwEditId(null); setPwMsg('') }, 2000) }
  }

  async function inviteMember(orgId: string) {
    if (!inviteEmail.trim()) { setInviteMsg({ ok: false, msg: 'メールアドレスを入力してください' }); return }
    setInviting(true)
    setInviteMsg(null)
    const res = await fetch('/api/superadmin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superadmin-key': SUPERADMIN_KEY },
      body: JSON.stringify({ orgId, email: inviteEmail.trim(), role: inviteRole }),
    })
    const d = await res.json()
    setInviteMsg({ ok: res.ok, msg: res.ok ? (d.isExisting ? `${d.email} を組織に追加しました（既存ユーザー）` : `${d.email} の招待リンクを発行しました`) : d.error })
    if (res.ok) {
      setInviteLink(d.inviteLink || null)
      setCopied(false)
      setInviteEmail('')
      // メンバーリストを直接リロード（ダブルトグルバグ回避）
      setMembersLoading(true)
      const r2 = await fetch(`/api/superadmin/members?orgId=${orgId}`, {
        headers: { 'x-superadmin-key': SUPERADMIN_KEY },
      })
      if (r2.ok) {
        setMembers(await r2.json())
        setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, member_count: o.member_count + 1 } : o))
      }
      setMembersLoading(false)
    }
    setInviting(false)
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
        <div className="flex items-center gap-4">
          <Link href="/"
            className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors">
            ← 管理画面へ
          </Link>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            ログアウト
          </button>
        </div>
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

        {/* superadmin管理 */}
        <div className="bg-slate-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm">superadmin管理</h2>
              <p className="text-slate-400 text-xs mt-0.5">システム全体へのアクセス権を持つアカウント</p>
            </div>
            <button
              onClick={() => { setShowSaPanel(v => !v); setSaMsg(null) }}
              className="text-sm px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold transition-colors"
            >
              {showSaPanel ? '閉じる' : '管理する'}
            </button>
          </div>

          {/* superadmin一覧 */}
          <div className="px-5 py-3 flex flex-wrap gap-2">
            {superadminEmails.map(email => (
              <div key={email} className="flex items-center gap-1.5 bg-purple-900/40 border border-purple-700/50 rounded-lg px-3 py-1.5">
                <span className="text-purple-300 text-xs font-semibold">{email}</span>
                {!['souta51203@gmail.com', 'origin.compamy001@gmail.com'].includes(email) && (
                  <button
                    onClick={() => removeSuperadmin(email)}
                    className="text-purple-500 hover:text-red-400 text-xs ml-1 transition-colors"
                  >✕</button>
                )}
              </div>
            ))}
          </div>

          {showSaPanel && (
            <div className="border-t border-slate-700 bg-slate-900 px-5 py-4">
              <p className="text-xs text-slate-400 mb-3">
                追加したメールアドレスはsuperadmin権限を持ちます。<br />
                未登録の場合は招待メールが自動で送信されます。
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newSaEmail}
                  onChange={e => setNewSaEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSuperadmin()}
                  placeholder="招待するメールアドレス"
                  className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={addSuperadmin}
                  disabled={saAdding}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  {saAdding ? '追加中...' : '追加'}
                </button>
              </div>
              {saMsg && (
                <p className={`mt-2 text-xs font-medium ${saMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {saMsg.msg}
                </p>
              )}
              {saInviteLink && (
                <div className="mt-3 bg-slate-800 border border-purple-700/50 rounded-xl p-3">
                  <p className="text-xs text-purple-300 font-bold mb-2">📎 招待リンク（LINEで送付してください）</p>
                  <div className="flex gap-2 items-start">
                    <p className="text-xs text-slate-300 break-all flex-1 leading-relaxed">{saInviteLink}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(saInviteLink)
                        setSaCopied(true)
                        setTimeout(() => setSaCopied(false), 2000)
                      }}
                      className="shrink-0 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {saCopied ? 'コピー済み ✓' : 'コピー'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">※ リンクの有効期限は24時間です</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 組織一覧 */}
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="font-bold">組織一覧</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={loadOrgs}
                className="text-slate-400 hover:text-white text-sm transition-colors"
              >
                ↻ 更新
              </button>
              <button
                onClick={() => { setShowAddForm(v => !v); setAddError('') }}
                className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors"
              >
                + 組織を追加
              </button>
            </div>
          </div>

          {/* 新規組織追加フォーム */}
          {showAddForm && (
            <div className="border-b border-slate-700 bg-slate-900 px-5 py-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4">新規組織を追加</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">組織名 *</label>
                  <input
                    type="text"
                    value={newOrg.name}
                    onChange={e => setNewOrg(v => ({ ...v, name: e.target.value }))}
                    placeholder="例: 株式会社サンプル"
                    className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">スラッグ * (英数字・ハイフン)</label>
                  <input
                    type="text"
                    value={newOrg.slug}
                    onChange={e => setNewOrg(v => ({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="例: sample-corp"
                    className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">プラン</label>
                  <select
                    value={newOrg.plan}
                    onChange={e => setNewOrg(v => ({ ...v, plan: e.target.value }))}
                    className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
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
                    value={newOrg.max_members}
                    onChange={e => setNewOrg(v => ({ ...v, max_members: Number(e.target.value) }))}
                    className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">トライアル期限（任意）</label>
                  <input
                    type="date"
                    value={newOrg.trial_ends_at}
                    onChange={e => setNewOrg(v => ({ ...v, trial_ends_at: e.target.value }))}
                    className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              {addError && <p className="text-red-400 text-xs mb-3">{addError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={addOrg}
                  disabled={adding}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {adding ? '作成中...' : '作成する'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddError('') }}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">読み込み中...</div>
          ) : orgs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">組織が見つかりません</div>
          ) : (
            <div className="divide-y divide-slate-700">
              {orgs.map(org => (
                <div key={org.id}>
                  {/* 通常行 */}
                  <div className="px-5 py-4 flex items-center gap-3">
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

                    {/* ボタン群 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleMembers(org.id)}
                        className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                          membersOrgId === org.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white'
                        }`}
                      >
                        メンバー
                      </button>
                      <button
                        onClick={() => editingId === org.id ? cancelEdit() : startEdit(org)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                      >
                        {editingId === org.id ? 'キャンセル' : '編集'}
                      </button>
                      <button
                        onClick={() => deleteOrg(org)}
                        disabled={deletingId === org.id}
                        className="text-sm px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-300 hover:text-white transition-colors disabled:opacity-50"
                      >
                        {deletingId === org.id ? '削除中...' : '削除'}
                      </button>
                    </div>
                  </div>

                  {/* メンバー一覧パネル */}
                  {membersOrgId === org.id && (
                    <div className="border-t border-slate-700 bg-slate-950 px-5 py-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-300">メンバー管理 — {org.name}</h3>
                        <button
                          onClick={() => { setInviteOrgId(inviteOrgId === org.id ? null : org.id); setInviteMsg(null); setInviteEmail('') }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold transition-colors"
                        >
                          + メンバー招待
                        </button>
                      </div>

                      {/* 招待フォーム */}
                      {inviteOrgId === org.id && (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
                          <p className="text-xs text-slate-400 mb-3">招待リンクを発行してLINEで共有できます</p>
                          <div className="flex gap-2 flex-wrap">
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={e => { setInviteEmail(e.target.value); setInviteLink(null) }}
                              placeholder="メールアドレス"
                              className="flex-1 min-w-40 bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <select
                              value={inviteRole}
                              onChange={e => setInviteRole(e.target.value)}
                              className="bg-slate-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="member">メンバー</option>
                              <option value="manager">マネージャー</option>
                              <option value="admin">管理者</option>
                            </select>
                            <button
                              onClick={() => inviteMember(org.id)}
                              disabled={inviting}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                              {inviting ? '発行中...' : 'リンク発行'}
                            </button>
                          </div>
                          {inviteMsg && (
                            <p className={`mt-2 text-xs font-medium ${inviteMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                              {inviteMsg.msg}
                            </p>
                          )}
                          {/* 招待リンク表示 */}
                          {inviteLink && (
                            <div className="mt-3 bg-slate-800 border border-indigo-700/50 rounded-xl p-3">
                              <p className="text-xs text-indigo-300 font-bold mb-2">📎 招待リンク（LINEで送付してください）</p>
                              <div className="flex gap-2 items-start">
                                <p className="text-xs text-slate-300 break-all flex-1 leading-relaxed">{inviteLink}</p>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(inviteLink)
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 2000)
                                  }}
                                  className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  {copied ? 'コピー済み ✓' : 'コピー'}
                                </button>
                              </div>
                              <p className="text-xs text-slate-500 mt-2">※ リンクの有効期限は24時間です</p>
                            </div>
                          )}
                        </div>
                      )}

                      {membersLoading ? (
                        <p className="text-slate-400 text-sm">読み込み中...</p>
                      ) : members.length === 0 ? (
                        <p className="text-slate-500 text-sm">メンバーがいません</p>
                      ) : (
                        <div className="divide-y divide-slate-800">
                          {members.map(m => (
                            <div key={m.id} className="py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                  style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)', color: 'white' }}>
                                  {m.email.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm text-white font-semibold truncate">{m.email}</p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${m.email_confirmed ? 'bg-emerald-900/60 text-emerald-400' : 'bg-amber-900/60 text-amber-400'}`}>
                                      {m.email_confirmed ? '確認済み' : '未確認'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    参加: {new Date(m.joined_at).toLocaleDateString('ja-JP')}
                                    {m.last_sign_in_at && <> ・ 最終ログイン: {new Date(m.last_sign_in_at).toLocaleDateString('ja-JP')}</>}
                                  </p>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                  m.role === 'admin' ? 'bg-red-900/60 text-red-300' :
                                  m.role === 'manager' ? 'bg-blue-900/60 text-blue-300' :
                                  'bg-slate-700 text-slate-400'
                                }`}>
                                  {ROLE_LABELS[m.role] ?? m.role}
                                </span>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    onClick={() => { setPwEditId(pwEditId === m.id ? null : m.id); setNewPw(''); setPwMsg('') }}
                                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                                  >
                                    PW変更
                                  </button>
                                  <button
                                    onClick={() => sendPasswordReset(m)}
                                    disabled={resetingMemberId === m.id}
                                    className="text-xs px-2.5 py-1 rounded-lg bg-blue-900/50 hover:bg-blue-800 text-blue-300 hover:text-white transition-colors disabled:opacity-50"
                                  >
                                    {resetingMemberId === m.id ? '送信中...' : 'PW reset'}
                                  </button>
                                  <button
                                    onClick={() => deleteMember(m)}
                                    disabled={deletingMemberId === m.id}
                                    className="text-xs px-2.5 py-1 rounded-lg bg-red-900/50 hover:bg-red-800 text-red-300 hover:text-white transition-colors disabled:opacity-50"
                                  >
                                    {deletingMemberId === m.id ? '削除中...' : '削除'}
                                  </button>
                                </div>
                              </div>

                              {/* パスワード設定リンク */}
                              {resetMsg?.id === m.id && (
                                <div className="mt-2 pl-11">
                                  <p className={`text-xs mb-1.5 ${resetMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {resetMsg.msg}
                                  </p>
                                  {resetMsg.link && (
                                    <div className="bg-slate-800 border border-blue-700/50 rounded-xl p-3">
                                      <p className="text-xs text-blue-300 font-bold mb-2">🔑 パスワード設定リンク（LINEで送付）</p>
                                      <div className="flex gap-2 items-start">
                                        <p className="text-xs text-slate-300 break-all flex-1 leading-relaxed">{resetMsg.link}</p>
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(resetMsg.link!)
                                            setResetLinkCopied(true)
                                            setTimeout(() => setResetLinkCopied(false), 2000)
                                          }}
                                          className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                          {resetLinkCopied ? 'コピー済み ✓' : 'コピー'}
                                        </button>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-2">※ 有効期限は24時間です</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* PW直接変更フォーム */}
                              {pwEditId === m.id && (
                                <div className="mt-2 pl-11 flex gap-2 items-center flex-wrap">
                                  <input
                                    type="password"
                                    value={newPw}
                                    onChange={e => setNewPw(e.target.value)}
                                    placeholder="新しいパスワード（6文字以上）"
                                    className="flex-1 min-w-40 bg-slate-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <button
                                    onClick={() => changePassword(m)}
                                    disabled={pwSaving}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors"
                                  >
                                    {pwSaving ? '変更中...' : '変更する'}
                                  </button>
                                  {pwMsg && (
                                    <span className={`text-xs ${pwMsg.includes('変更') ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {pwMsg}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

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
