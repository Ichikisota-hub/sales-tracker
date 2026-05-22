'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { localToday } from '@/lib/dateUtils'
import { CheckCircle, Flame } from 'lucide-react'

type Props = { repId: string; repName: string }

export default function DailyCommitForm({ repId, repName }: Props) {
  const today = localToday()
  const [targetVisits, setTargetVisits] = useState(20)
  const [targetContracts, setTargetContracts] = useState(2)
  const [committedAt, setCommittedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadCommit()
  }, [repId])

  async function loadCommit() {
    const { data } = await supabase
      .from('daily_records')
      .select('target_visits, target_contracts, committed_at')
      .eq('sales_rep_id', repId)
      .eq('record_date', today)
      .single()

    if (data?.committed_at) {
      setCommittedAt(data.committed_at)
      setTargetVisits(data.target_visits ?? 20)
      setTargetContracts(data.target_contracts ?? 2)
    }
  }

  async function handleCommit() {
    setSaving(true)
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('daily_records')
      .upsert({
        sales_rep_id: repId,
        record_date: today,
        target_visits: targetVisits,
        target_contracts: targetContracts,
        committed_at: now,
      }, { onConflict: 'sales_rep_id,record_date' })

    if (!error) {
      setCommittedAt(now)
      setMessage('コミット完了！')
      setTimeout(() => setMessage(''), 3000)
    }
    setSaving(false)
  }

  const isCommitted = !!committedAt

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 max-w-sm mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Flame size={20} className="text-orange-500" />
        <h2 className="font-bold text-slate-800">本日のコミット</h2>
        <span className="text-xs text-slate-400 ml-auto">{today}</span>
      </div>

      {isCommitted ? (
        <div className="text-center py-4">
          <CheckCircle size={40} className="text-green-500 mx-auto mb-2" />
          <p className="font-bold text-green-700">コミット済み</p>
          <p className="text-sm text-slate-500 mt-1">
            訪問 {targetVisits}件 / 受注 {targetContracts}件
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {new Date(committedAt!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 送信
          </p>
          <button
            onClick={() => setCommittedAt(null)}
            className="mt-3 text-xs text-slate-400 underline"
          >
            修正する
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">訪問目標（件）</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTargetVisits(v => Math.max(0, v - 5))}
                className="w-10 h-10 rounded-full border-2 border-slate-200 font-bold text-lg hover:bg-slate-50"
              >−</button>
              <span className="text-2xl font-bold text-slate-800 w-16 text-center">{targetVisits}</span>
              <button
                onClick={() => setTargetVisits(v => v + 5)}
                className="w-10 h-10 rounded-full border-2 border-blue-300 bg-blue-50 font-bold text-lg text-blue-700 hover:bg-blue-100"
              >＋</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">受注目標（件）</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTargetContracts(v => Math.max(0, v - 1))}
                className="w-10 h-10 rounded-full border-2 border-slate-200 font-bold text-lg hover:bg-slate-50"
              >−</button>
              <span className="text-2xl font-bold text-slate-800 w-16 text-center">{targetContracts}</span>
              <button
                onClick={() => setTargetContracts(v => v + 1)}
                className="w-10 h-10 rounded-full border-2 border-orange-300 bg-orange-50 font-bold text-lg text-orange-700 hover:bg-orange-100"
              >＋</button>
            </div>
          </div>

          <button
            onClick={handleCommit}
            disabled={saving}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving ? '送信中…' : '🔥 コミット！'}
          </button>

          {message && (
            <p className="text-center text-green-600 font-bold text-sm">{message}</p>
          )}
        </div>
      )}
    </div>
  )
}
