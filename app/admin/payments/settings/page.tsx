'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

const RANKS = [
  'アポインター',
  'クローザー1',
  'クローザー2',
  'ミニチームリーダー①',
  'ミニチームリーダー②',
  '幹部メンバー',
  'チームリーダー',
]

interface SalesRep {
  id: string
  name: string
  incentive_rank?: string
  line_user_id?: string
  bank_name?: string
  bank_branch?: string
  bank_account_type?: string
  bank_account_number?: string
  bank_account_holder?: string
}

export default function PaymentSettingsPage() {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<SalesRep>>>({})
  const supabase = createClient()

  useEffect(() => {
    supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order')
      .then(({ data }) => {
        const list = (data ?? []) as SalesRep[]
        setReps(list)
        const init: Record<string, Partial<SalesRep>> = {}
        list.forEach(r => { init[r.id] = { ...r } })
        setEdits(init)
      })
  }, [])

  function update(repId: string, field: keyof SalesRep, value: string) {
    setEdits(prev => ({ ...prev, [repId]: { ...prev[repId], [field]: value } }))
  }

  async function save(repId: string) {
    setSaving(repId)
    const data = edits[repId] ?? {}
    await supabase.from('sales_reps').update({
      incentive_rank: data.incentive_rank,
      line_user_id: data.line_user_id || null,
      bank_name: data.bank_name || null,
      bank_branch: data.bank_branch || null,
      bank_account_type: data.bank_account_type || null,
      bank_account_number: data.bank_account_number || null,
      bank_account_holder: data.bank_account_holder || null,
    }).eq('id', repId)
    setSaving(null)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center gap-2">
        <Link href="/admin/payments" className="text-slate-400 hover:text-white text-sm">← 支払通知書管理</Link>
        <span className="text-slate-600">|</span>
        <h1 className="font-bold text-sm">支払設定（インセンティブ・銀行・LINE）</h1>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-4 mt-4">
        <p className="text-xs text-slate-500 bg-white rounded-lg p-3 shadow-sm">
          各担当者のインセンティブランク・銀行口座・LINE user_idを設定してください。<br />
          LINE user_idはLINE公式アカウントにメッセージを送ってもらうことで取得できます。
        </p>

        {reps.map(rep => {
          const e = edits[rep.id] ?? {}
          return (
            <div key={rep.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800">{rep.name}</h3>
                <button onClick={() => save(rep.id)} disabled={saving === rep.id}
                  className="bg-blue-900 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-800 disabled:opacity-50">
                  {saving === rep.id ? '保存中…' : '保存'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">インセンティブランク</label>
                  <select value={e.incentive_rank ?? 'アポインター'}
                    onChange={ev => update(rep.id, 'incentive_rank', ev.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm">
                    {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">LINE user_id</label>
                  <input type="text" value={e.line_user_id ?? ''}
                    onChange={ev => update(rep.id, 'line_user_id', ev.target.value)}
                    placeholder="Uxxxxxxxxxxxx"
                    className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">銀行名</label>
                  <input type="text" value={e.bank_name ?? ''}
                    onChange={ev => update(rep.id, 'bank_name', ev.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">支店名</label>
                  <input type="text" value={e.bank_branch ?? ''}
                    onChange={ev => update(rep.id, 'bank_branch', ev.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">口座種別</label>
                  <select value={e.bank_account_type ?? '普通預金'}
                    onChange={ev => update(rep.id, 'bank_account_type', ev.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm">
                    <option>普通預金</option>
                    <option>当座預金</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">口座番号</label>
                  <input type="text" value={e.bank_account_number ?? ''}
                    onChange={ev => update(rep.id, 'bank_account_number', ev.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-500 block mb-1">口座名義</label>
                  <input type="text" value={e.bank_account_holder ?? ''}
                    onChange={ev => update(rep.id, 'bank_account_holder', ev.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
