'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep, Contract } from '@/lib/supabase'

const STATUS_OPTIONS = ['手続き中', '工事日決定', '開通', 'キャンセル']

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  '手続き中':  { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-400',    border: 'border-blue-200' },
  '工事日決定': { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400',   border: 'border-amber-200' },
  '開通':      { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  'キャンセル': { bg: 'bg-red-50',     text: 'text-red-600',    dot: 'bg-red-400',     border: 'border-red-200' },
}

type Props = {
  reps: SalesRep[]
  selectedRepId: string | null
  onAdd: () => void
}

// 今日との日数差（正=過去、負=未来）
function daysDiff(dateStr: string): number {
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(dateStr); d.setHours(0,0,0,0)
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return dateStr.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3')
}

// 工事日電話アラート：工事日が未定 かつ 獲得日から3日以上経過 かつ キャンセル/開通でない
function needsCallAlert(c: Contract): boolean {
  if (c.status === 'キャンセル' || c.status === '開通') return false
  if (c.construction_date) return false // 工事日が決まったらアラート不要
  return daysDiff(c.acquired_date) >= 3
}

// 工事日が過去か
function isConstructionPast(c: Contract): boolean {
  if (!c.construction_date) return false
  return daysDiff(c.construction_date) > 0
}

export default function ContractListView({ reps, selectedRepId, onAdd }: Props) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [filterRep, setFilterRep] = useState<string>(selectedRepId || 'all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // 編集用 state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editConstDate, setEditConstDate] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [saving, setSaving] = useState(false)

  // 削除確認 state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadContracts() }, [])

  async function loadContracts() {
    setLoading(true)
    const { data } = await supabase
      .from('contracts')
      .select('*')
      .order('acquired_date', { ascending: false })
    setContracts(data || [])
    setLoading(false)
  }

  // 保存（工事日 + ステータス）
  async function saveEdit(id: string) {
    setSaving(true)
    const updates: Record<string, unknown> = {
      status: editStatus,
      updated_at: new Date().toISOString(),
    }
    // 工事日：入力があればセット、空なら null でクリア
    updates.construction_date = editConstDate || null
    await supabase.from('contracts').update(updates).eq('id', id)
    setSaving(false)
    setEditingId(null)
    loadContracts()
  }

  // 削除
  async function deleteContract(id: string) {
    setDeleting(true)
    await supabase.from('contracts').delete().eq('id', id)
    setDeleting(false)
    setDeletingId(null)
    loadContracts()
  }

  function startEdit(c: Contract) {
    setEditingId(c.id)
    setEditConstDate(c.construction_date || '')
    setEditStatus(c.status)
  }

  // 絞り込み
  const filtered = contracts.filter(c => {
    if (filterRep !== 'all' && c.sales_rep_id !== filterRep) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  })

  const repName = (id: string) => reps.find(r => r.id === id)?.name || '—'

  function wifiLabel(c: Contract) {
    if (!c.wifi_provider) return ''
    return c.wifi_provider === 'その他' && c.wifi_provider_other
      ? `その他(${c.wifi_provider_other})`
      : c.wifi_provider
  }

  const counts = {
    all: contracts.length,
    '手続き中':  contracts.filter(c => c.status === '手続き中').length,
    '工事日決定': contracts.filter(c => c.status === '工事日決定').length,
    '開通':      contracts.filter(c => c.status === '開通').length,
    'キャンセル': contracts.filter(c => c.status === 'キャンセル').length,
  }

  // 工事日電話アラートが必要な件数
  const alertContracts = filtered.filter(needsCallAlert)

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xl font-black text-slate-800">🏠 契約宅一覧</div>
          <div className="text-sm text-slate-400 mt-0.5">全{contracts.length}件</div>
        </div>
        <button onClick={onAdd}
          className="bg-blue-600 text-white text-sm font-black px-5 py-3 rounded-2xl shadow-lg active:scale-95 transition-all">
          ＋ 追加
        </button>
      </div>

      {/* ── 担当者フィルター ── */}
      <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
        <div className="text-xs font-bold text-slate-500 mb-2">担当者で絞り込み</div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterRep('all')}
            className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${filterRep === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
            全員 ({contracts.length})
          </button>
          {reps.map(r => {
            const cnt = contracts.filter(c => c.sales_rep_id === r.id).length
            if (cnt === 0) return null
            return (
              <button key={r.id} onClick={() => setFilterRep(r.id)}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${filterRep === r.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {r.name} ({cnt})
              </button>
            )
          })}
        </div>
      </div>

      {/* ── ステータスフィルター ── */}
      <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
        <div className="text-xs font-bold text-slate-500 mb-2">ステータスで絞り込み</div>
        <div className="flex gap-1 flex-wrap">
          {([
            { v: 'all',    label: `全て (${counts.all})` },
            { v: '手続き中',  label: `手続き中 (${counts['手続き中']})` },
            { v: '工事日決定', label: `工事日決定 (${counts['工事日決定']})` },
            { v: '開通',      label: `開通 (${counts['開通']})` },
            { v: 'キャンセル', label: `キャンセル (${counts['キャンセル']})` },
          ] as { v: string; label: string }[]).map(({ v, label }) => {
            const sty = v !== 'all' ? STATUS_STYLE[v] : null
            return (
              <button key={v} onClick={() => setFilterStatus(v)}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                  filterStatus === v
                    ? sty ? `${sty.bg} ${sty.text} border-2 ${sty.border}` : 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 工事日電話アラートバナー ── */}
      {alertContracts.length > 0 && (
        <div className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">📞</span>
            <div className="text-base font-black text-orange-700">
              工事日電話が必要 — {alertContracts.length}件
            </div>
          </div>
          <div className="text-xs text-orange-600 mb-2">
            獲得日から3日以上経過・工事日未定のお客様です
          </div>
          <div className="space-y-2">
            {alertContracts.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-orange-200">
                <div>
                  <div className="text-sm font-black text-slate-800">{c.customer_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {repName(c.sales_rep_id)} · 獲得: {formatDate(c.acquired_date)}
                    <span className="text-orange-600 font-bold ml-2">{daysDiff(c.acquired_date)}日経過</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 削除確認モーダル ── */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-xl font-black text-red-600 mb-2">🗑️ 削除の確認</div>
            <div className="text-base text-slate-600 mb-2">
              「{contracts.find(c => c.id === deletingId)?.customer_name}」を削除しますか？
            </div>
            <div className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2 mb-4">
              この操作は元に戻せません
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeletingId(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-base">
                キャンセル
              </button>
              <button onClick={() => deleteContract(deletingId)} disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-base">
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 一覧 ── */}
      {loading ? (
        <div className="text-center text-slate-400 py-8 text-base">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          <div className="text-4xl mb-2">🏠</div>
          <div className="text-base font-bold">データがありません</div>
          <div className="text-sm mt-1">「＋ 追加」から契約宅を登録してください</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const sty = STATUS_STYLE[c.status] || STATUS_STYLE['手続き中']
            const callAlert = needsCallAlert(c)
            const constPast = isConstructionPast(c)
            const isEditing = editingId === c.id
            const diff = daysDiff(c.acquired_date)

            return (
              <div key={c.id}
                className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-all ${
                  callAlert          ? 'border-orange-400' :
                  constPast          ? 'border-red-300' :
                  c.status === '開通' ? 'border-emerald-300' :
                  c.status === 'キャンセル' ? 'border-slate-200 opacity-60' :
                  'border-slate-100'
                }`}>

                {/* 工事日電話バナー（工事日未定 & 3日以上経過） */}
                {callAlert && (
                  <div className="bg-orange-500 text-white text-sm font-black px-4 py-2 flex items-center gap-2">
                    <span>📞</span>
                    <span>工事日電話してください（{diff}日経過）</span>
                  </div>
                )}

                {/* 工事日超過バナー */}
                {constPast && !callAlert && c.status !== 'キャンセル' && c.status !== '開通' && (
                  <div className="bg-red-100 text-red-700 text-sm font-bold px-4 py-2">
                    ⚠️ 工事日を過ぎています
                  </div>
                )}

                <div className="p-4">
                  {/* 上段：顧客名 + ステータスバッジ + 削除ボタン */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-black text-slate-800 truncate">{c.customer_name}</div>
                      <div className="text-sm text-slate-400 mt-0.5">
                        <span className="font-bold text-blue-600">{repName(c.sales_rep_id)}</span>
                        <span className="mx-1.5">·</span>
                        <span>獲得: {formatDate(c.acquired_date)}</span>
                      </div>
                    </div>
                    {/* ステータスバッジ */}
                    <div className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${sty.bg} ${sty.border}`}>
                      <div className={`w-2 h-2 rounded-full ${sty.dot}`} />
                      <span className={`text-sm font-black ${sty.text}`}>{c.status}</span>
                    </div>
                    {/* 削除ボタン */}
                    <button onClick={() => setDeletingId(c.id)}
                      className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all text-lg">
                      🗑️
                    </button>
                  </div>

                  {/* 詳細情報 */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm mb-3">
                    {c.phone && (
                      <div className="flex items-center gap-1.5 col-span-1">
                        <span className="text-slate-400">📞</span>
                        <a href={`tel:${c.phone}`} className="text-blue-600 font-medium truncate">{c.phone}</a>
                      </div>
                    )}
                    {wifiLabel(c) && (
                      <div className="flex items-center gap-1.5 col-span-1">
                        <span className="text-slate-400">📶</span>
                        <span className="text-slate-600 font-medium truncate">{wifiLabel(c)}</span>
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-1.5 col-span-2">
                        <span className="text-slate-400 flex-shrink-0">🏠</span>
                        <span className="text-slate-600 text-sm truncate">{c.address}</span>
                      </div>
                    )}
                    {(c.area_pref || c.area_city) && (
                      <div className="flex items-center gap-1.5 col-span-2">
                        <span className="text-slate-400 flex-shrink-0">📍</span>
                        <span className="text-slate-600 text-sm">{c.area_pref}{c.area_city ? ` ${c.area_city}` : ''}</span>
                      </div>
                    )}
                  </div>

                  {/* 工事日 + ステータス編集エリア */}
                  {isEditing ? (
                    <div className="bg-slate-50 rounded-2xl p-3 space-y-3 border-2 border-blue-200">
                      {/* 工事日入力 */}
                      <div>
                        <div className="text-xs font-bold text-slate-600 mb-1.5">🔧 工事日</div>
                        <div className="flex gap-2">
                          <input type="date" value={editConstDate} onChange={e => setEditConstDate(e.target.value)}
                            className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:border-blue-400 bg-white" />
                          {/* 工事日クリアボタン */}
                          {editConstDate && (
                            <button onClick={() => setEditConstDate('')}
                              className="flex-shrink-0 px-3 py-2 rounded-xl bg-red-50 text-red-500 text-sm font-bold border border-red-200">
                              ✕ 削除
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          ※ 工事日が決まると「📞 工事日電話」アラートが消えます
                        </div>
                      </div>

                      {/* ステータス選択 */}
                      <div>
                        <div className="text-xs font-bold text-slate-600 mb-1.5">📊 ステータス</div>
                        <div className="grid grid-cols-2 gap-2">
                          {STATUS_OPTIONS.map(s => {
                            const st = STATUS_STYLE[s]
                            return (
                              <button key={s} onClick={() => setEditStatus(s)}
                                className={`py-3 rounded-xl text-sm font-black transition-all border-2 ${
                                  editStatus === s
                                    ? `${st.bg} ${st.text} ${st.border}`
                                    : 'bg-white text-slate-400 border-slate-200'
                                }`}>
                                {s}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* 保存 / キャンセル */}
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)}
                          className="flex-1 py-2.5 rounded-xl bg-white text-slate-600 font-bold text-sm border-2 border-slate-200">
                          キャンセル
                        </button>
                        <button onClick={() => saveEdit(c.id)} disabled={saving}
                          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-black text-sm">
                          {saving ? '保存中...' : '保存 ✓'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 通常表示：工事日 + 編集ボタン */
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1.5 flex-1 rounded-xl px-3 py-2.5 ${
                        c.construction_date
                          ? constPast ? 'bg-red-50' : 'bg-emerald-50'
                          : 'bg-slate-50'
                      }`}>
                        <span className="text-base">🔧</span>
                        <span className={`text-sm font-bold ${
                          c.construction_date
                            ? constPast ? 'text-red-600' : 'text-emerald-700'
                            : 'text-slate-400'
                        }`}>
                          {c.construction_date
                            ? `工事日: ${formatDate(c.construction_date)}${constPast ? ' (済)' : ''}`
                            : '工事日未定'}
                        </span>
                      </div>
                      <button onClick={() => startEdit(c)}
                        className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-all">
                        編集
                      </button>
                    </div>
                  )}

                  {/* メモ */}
                  {c.notes && (
                    <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                      📝 {c.notes}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
