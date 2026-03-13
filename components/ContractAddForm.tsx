'use client'

import { useState } from 'react'
import { supabase, SalesRep, Contract } from '@/lib/supabase'
import { KANSAI_AREAS, PREF_LIST } from '@/lib/areas'

const WIFI_OPTIONS = [
  'ベイコム', 'eo光', 'J:com', 'Nuro光', 'SB光', 'SB air',
  'ドコモ光', 'au光', 'フレッツ光', 'Sonet光', 'Biglobe光', 'その他',
]

type Props = {
  reps: SalesRep[]
  defaultRepId?: string
  onSaved: () => void
  onCancel: () => void
}

export default function ContractAddForm({ reps, defaultRepId, onSaved, onCancel }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    sales_rep_id: defaultRepId || reps[0]?.id || '',
    customer_name: '',
    phone: '',
    address: '',
    area_pref: '',
    area_city: '',
    wifi_provider: '',
    wifi_provider_other: '',
    acquired_date: today,
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.customer_name.trim()) { setError('顧客名を入力してください'); return }
    if (!form.sales_rep_id) { setError('担当者を選択してください'); return }
    setError('')
    setSaving(true)
    const { error: e } = await supabase.from('contracts').insert({
      sales_rep_id: form.sales_rep_id,
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      area_pref: form.area_pref,
      area_city: form.area_city,
      wifi_provider: form.wifi_provider,
      wifi_provider_other: form.wifi_provider === 'その他' ? form.wifi_provider_other.trim() : '',
      acquired_date: form.acquired_date,
      status: '手続き中',
      notes: form.notes.trim(),
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  const cityList = form.area_pref ? (KANSAI_AREAS[form.area_pref] || []) : []

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-0">
      <div className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="text-xl font-black text-slate-800">📝 契約宅を追加</div>
            <button onClick={onCancel} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-lg font-bold">✕</button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-sm font-bold rounded-xl px-4 py-3">
              ⚠️ {error}
            </div>
          )}

          {/* 担当者 */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">担当者 <span className="text-red-500">*</span></label>
            <select value={form.sales_rep_id} onChange={e => set('sales_rep_id', e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:border-blue-400">
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* 顧客名 */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">顧客名 <span className="text-red-500">*</span></label>
            <input type="text" value={form.customer_name} onChange={e => set('customer_name', e.target.value)}
              placeholder="例：山田 太郎"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-400" />
          </div>

          {/* 電話番号 */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">電話番号</label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="例：090-1234-5678"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-400" />
          </div>

          {/* 住所 */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">住所</label>
            <input type="text" value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="例：大阪府大阪市中央区〇〇 1-2-3"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-400" />
          </div>

          {/* エリア */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">エリア</label>
            <div className="flex gap-2">
              <select value={form.area_pref} onChange={e => { set('area_pref', e.target.value); set('area_city', '') }}
                className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:border-blue-400">
                <option value="">都道府県</option>
                {PREF_LIST.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={form.area_city} onChange={e => set('area_city', e.target.value)}
                disabled={!form.area_pref}
                className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-3 text-base bg-white focus:outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:text-slate-400">
                <option value="">市区町村</option>
                {cityList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* 利用WiFi */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">利用WiFi（現在の回線）</label>
            <div className="grid grid-cols-3 gap-2">
              {WIFI_OPTIONS.map(w => (
                <button key={w} onClick={() => set('wifi_provider', w)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${
                    form.wifi_provider === w
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}>
                  {w}
                </button>
              ))}
            </div>
            {form.wifi_provider === 'その他' && (
              <input type="text" value={form.wifi_provider_other} onChange={e => set('wifi_provider_other', e.target.value)}
                placeholder="回線名を入力"
                className="mt-2 w-full border-2 border-blue-300 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-400" />
            )}
          </div>

          {/* 獲得日 */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">獲得日</label>
            <input type="date" value={form.acquired_date} onChange={e => set('acquired_date', e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-400" />
          </div>

          {/* メモ */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">メモ</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="備考など"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-400 resize-none" />
          </div>

          {/* 保存ボタン */}
          <div className="flex gap-2 pt-2 pb-4">
            <button onClick={onCancel}
              className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 text-base font-bold">
              キャンセル
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`flex-2 flex-1 py-4 rounded-2xl text-white text-base font-black transition-all ${
                saving ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
              }`}>
              {saving ? '保存中...' : '💾 保存する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
