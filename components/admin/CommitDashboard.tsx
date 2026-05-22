'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { localToday } from '@/lib/dateUtils'
import { Flame, Send, RefreshCw, CheckCircle } from 'lucide-react'

interface CommitRow {
  sales_rep_id: string
  rep_name: string
  target_visits: number
  target_contracts: number
  committed_at: string | null
}

export default function CommitDashboard({ organizationId }: { organizationId: string }) {
  const today = localToday()
  const [commits, setCommits] = useState<CommitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState('')
  const [groupId, setGroupId] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  useEffect(() => {
    loadCommits()
    loadGroupId()
  }, [organizationId])

  async function loadGroupId() {
    const { data } = await supabase
      .from('organizations')
      .select('line_group_id')
      .eq('id', organizationId)
      .single()
    if (data?.line_group_id) setGroupId(data.line_group_id)
  }

  async function saveGroupId() {
    setSavingGroup(true)
    await supabase
      .from('organizations')
      .update({ line_group_id: groupId })
      .eq('id', organizationId)
    setSavingGroup(false)
  }

  async function loadCommits() {
    setLoading(true)
    const { data: reps } = await supabase
      .from('sales_reps')
      .select('id, name')
      .eq('is_active', true)
      .eq('organization_id', organizationId)
      .order('display_order')

    const { data: records } = await supabase
      .from('daily_records')
      .select('sales_rep_id, target_visits, target_contracts, committed_at')
      .eq('record_date', today)
      .in('sales_rep_id', (reps ?? []).map((r: { id: string }) => r.id))

    interface RecordRow { sales_rep_id: string; target_visits: number; target_contracts: number; committed_at: string | null }
    const recordMap: Record<string, RecordRow> = {}
    ;(records ?? []).forEach((r: RecordRow) => { recordMap[r.sales_rep_id] = r })

    const rows: CommitRow[] = (reps ?? []).map((rep: { id: string; name: string }) => {
      const rec = recordMap[rep.id]
      return {
        sales_rep_id: rep.id,
        rep_name: rep.name,
        target_visits: rec?.target_visits ?? 0,
        target_contracts: rec?.target_contracts ?? 0,
        committed_at: rec?.committed_at ?? null,
      }
    })

    setCommits(rows)
    setLoading(false)
  }

  async function sendToLineGroup() {
    if (!groupId) { alert('LINE グループIDを設定してください'); return }
    setSending(true)

    const committedRows = commits.filter(c => c.committed_at)
    const notCommitted = commits.filter(c => !c.committed_at)

    const dateStr = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })

    let text = `🔥 本日のコミット ${dateStr}\n${'─'.repeat(20)}\n\n`

    committedRows.forEach(c => {
      text += `✅ ${c.rep_name}\n`
      text += `   訪問: ${c.target_visits}件 / 受注: ${c.target_contracts}件\n\n`
    })

    if (notCommitted.length > 0) {
      text += `${'─'.repeat(20)}\n⏳ 未コミット: ${notCommitted.map(c => c.rep_name).join('、')}`
    }

    const res = await fetch('/api/commits/send-line-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, text }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (data.ok) {
      setSentMsg('LINEグループに送信しました！')
      setTimeout(() => setSentMsg(''), 4000)
    } else {
      alert(data.error ?? '送信に失敗しました')
    }
    setSending(false)
  }

  const committedCount = commits.filter(c => c.committed_at).length

  return (
    <div className="space-y-4">
      {/* LINEグループID設定 */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-100">
        <p className="text-xs font-bold text-slate-500 mb-2">LINEグループID設定</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            placeholder="Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={saveGroupId}
            disabled={savingGroup}
            className="px-3 py-2 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            {savingGroup ? '保存中' : '保存'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">LINE Official Account ManagerでグループIDを確認してください</p>
      </div>

      {/* 当日コミット一覧 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Flame size={16} className="text-orange-500" />
          <span className="font-bold text-sm text-slate-800">本日のコミット</span>
          <span className="text-xs text-slate-400">{today}</span>
          <span className="ml-auto text-xs font-bold text-orange-600">{committedCount}/{commits.length}名</span>
          <button onClick={loadCommits} className="text-slate-400 hover:text-slate-600">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-center text-slate-400 text-sm">読み込み中…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left text-xs text-slate-500">担当者</th>
                <th className="px-3 py-2 text-center text-xs text-slate-500">訪問目標</th>
                <th className="px-3 py-2 text-center text-xs text-slate-500">受注目標</th>
                <th className="px-3 py-2 text-center text-xs text-slate-500">状態</th>
              </tr>
            </thead>
            <tbody>
              {commits.map(c => (
                <tr key={c.sales_rep_id} className="border-t border-slate-50">
                  <td className="px-3 py-2.5 font-medium">{c.rep_name}</td>
                  <td className="px-3 py-2.5 text-center">
                    {c.committed_at ? <span className="font-bold text-blue-700">{c.target_visits}件</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {c.committed_at ? <span className="font-bold text-orange-600">{c.target_contracts}件</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {c.committed_at
                      ? <span className="inline-flex items-center gap-1 text-xs text-green-600 font-bold"><CheckCircle size={12} />済</span>
                      : <span className="text-xs text-slate-400">未</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="px-4 py-3 border-t bg-slate-50 flex items-center gap-3">
          {sentMsg && <span className="text-green-600 text-xs font-bold flex-1">{sentMsg}</span>}
          <button
            onClick={sendToLineGroup}
            disabled={sending || committedCount === 0}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-500 disabled:opacity-40 transition-colors"
          >
            <Send size={14} />
            {sending ? '送信中…' : 'LINEグループに送信'}
          </button>
        </div>
      </div>
    </div>
  )
}
