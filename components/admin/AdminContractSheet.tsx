'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { Contract, SalesRep } from '@/lib/supabase'

const STATUS_COLOR: Record<string, string> = {
  '手続き中':  'bg-blue-100 text-blue-700',
  '工事日決定': 'bg-amber-100 text-amber-700',
  '開通':      'bg-emerald-100 text-emerald-700',
  'キャンセル': 'bg-red-100 text-red-500',
}

function Check({ val }: { val: boolean }) {
  return val
    ? <span className="text-emerald-600 font-bold">✓</span>
    : <span className="text-slate-300">–</span>
}

export default function AdminContractSheet() {
  const supabase = createClient()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [reps, setReps] = useState<SalesRep[]>([])
  const [loading, setLoading] = useState(true)
  const [filterRep, setFilterRep] = useState('all')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: contractData }, { data: repData }] = await Promise.all([
      supabase.from('contracts').select('*').order('acquired_date', { ascending: false }),
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
    ])
    setContracts(contractData || [])
    setReps(repData || [])
    setLoading(false)
  }

  const repMap = Object.fromEntries(reps.map(r => [r.id, r.name]))

  const filtered = contracts.filter(c => {
    if (filterRep !== 'all' && c.sales_rep_id !== filterRep) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (filterMonth && !(c.acquired_date || '').startsWith(filterMonth)) return false
    return true
  })

  function wifiLabel(c: Contract) {
    if (!c.wifi_provider) return ''
    return c.wifi_provider === 'その他' ? (c.wifi_provider_other || 'その他') : c.wifi_provider
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-slate-800 shrink-0">契約宅一覧（全員）</h2>
        <div className="flex flex-wrap gap-2 ml-auto items-center">
          <span className="text-xs text-slate-400 font-bold">{filtered.length}件</span>

          {/* 月絞り込み */}
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* 担当者絞り込み */}
          <select
            value={filterRep}
            onChange={e => setFilterRep(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全員</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          {/* ステータス絞り込み */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全ステータス</option>
            {['手続き中', '工事日決定', '開通', 'キャンセル'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* リセット */}
          {(filterRep !== 'all' || filterMonth !== '' || filterStatus !== 'all') && (
            <button
              onClick={() => { setFilterRep('all'); setFilterMonth(''); setFilterStatus('all') }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              リセット
            </button>
          )}
        </div>
      </div>

      {/* テーブル */}
      <div className="table-scroll" style={{ maxHeight: 'calc(100dvh - 320px)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-12">データがありません</p>
        ) : (
          <table className="sheet-table">
            <thead className="sticky-header">
              <tr>
                <th className="header-blue sticky-col" style={{ minWidth: 72 }}>担当者</th>
                <th className="header-blue" style={{ minWidth: 80 }}>顧客名</th>
                <th style={{ minWidth: 64 }}>ステータス</th>
                <th style={{ minWidth: 80 }}>獲得日</th>
                <th style={{ minWidth: 80 }}>工事日</th>
                <th style={{ minWidth: 100 }}>電話番号</th>
                <th style={{ minWidth: 160 }}>住所</th>
                <th style={{ minWidth: 56 }}>都道府県</th>
                <th style={{ minWidth: 72 }}>市区町村</th>
                <th style={{ minWidth: 80 }}>WiFi</th>
                <th style={{ minWidth: 36 }}>工事TEL</th>
                <th style={{ minWidth: 44 }}>OP外し</th>
                <th style={{ minWidth: 44 }}>固定外し</th>
                <th style={{ minWidth: 44 }}>RT外し</th>
                <th style={{ minWidth: 160 }}>メモ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? 'row-weekday' : ''} style={{ backgroundColor: i % 2 === 1 ? '#f8fafc' : undefined }}>
                  <td className="sticky-col font-bold text-slate-700" style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    {repMap[c.sales_rep_id] || '–'}
                  </td>
                  <td className="font-bold text-left px-2">{c.customer_name}</td>
                  <td>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_COLOR[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{c.acquired_date || '–'}</td>
                  <td>{c.construction_date || '–'}</td>
                  <td className="text-left px-2">
                    {c.phone
                      ? <a href={`tel:${c.phone}`} className="text-blue-600 hover:underline">{c.phone}</a>
                      : '–'}
                  </td>
                  <td className="text-left px-2">{c.address || '–'}</td>
                  <td>{c.area_pref || '–'}</td>
                  <td>{c.area_city || '–'}</td>
                  <td>{wifiLabel(c) || '–'}</td>
                  <td><Check val={c.construction_called} /></td>
                  <td>
                    {c.needs_option_removal ? <Check val={c.option_removed} /> : <span className="text-slate-200">N/A</span>}
                  </td>
                  <td>
                    {c.needs_landline_removal ? <Check val={c.landline_removed} /> : <span className="text-slate-200">N/A</span>}
                  </td>
                  <td>
                    {c.needs_router_removal ? <Check val={c.router_removed} /> : <span className="text-slate-200">N/A</span>}
                  </td>
                  <td className="text-left px-2 text-slate-500">{c.notes || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
