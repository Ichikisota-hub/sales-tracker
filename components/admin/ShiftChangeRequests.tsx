'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'

interface Request {
  id: string
  original_date: string
  requested_date: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewer_comment: string | null
  sales_reps: { name: string } | null
}

type Props = { organizationId: string; reviewerRepId: string }

export default function ShiftChangeRequests({ organizationId, reviewerRepId }: Props) {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  useEffect(() => { load() }, [organizationId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('shift_change_requests')
      .select('*, sales_reps(name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50)
    setRequests((data ?? []) as Request[])
    setLoading(false)
  }

  async function review(id: string, status: 'approved' | 'rejected') {
    const res = await fetch('/api/shifts/change-request', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, reviewerRepId, comment }),
    })
    if (res.ok) { setReviewing(null); setComment(''); load() }
  }

  const pending  = requests.filter(r => r.status === 'pending')
  const resolved = requests.filter(r => r.status !== 'pending')

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-orange-500" />
        <h3 className="font-bold text-sm text-slate-800">シフト変更申請</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pending.length > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
          未対応 {pending.length}件
        </span>
        <button onClick={load} className="ml-auto text-slate-400 hover:text-slate-600"><RefreshCw size={14} /></button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-4 text-center">読み込み中…</p>
      ) : requests.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">申請はありません</p>
      ) : (
        <div className="space-y-2">
          {/* 未対応 */}
          {pending.map(r => (
            <div key={r.id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-bold text-sm">{r.sales_reps?.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{new Date(r.created_at).toLocaleDateString('ja-JP')}</span>
                </div>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">未対応</span>
              </div>
              <div className="text-xs space-y-0.5">
                <p>対象日: <span className="font-medium">{r.original_date}</span>
                  {r.requested_date && <span> → {r.requested_date}に変更希望</span>}
                </p>
                <p>理由: {r.reason}</p>
              </div>

              {reviewing === r.id ? (
                <div className="space-y-2">
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="コメント（任意）"
                    rows={2}
                    className="w-full border rounded-lg px-2 py-1.5 text-xs resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => review(r.id, 'approved')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500">
                      <CheckCircle size={13} /> 承認
                    </button>
                    <button onClick={() => review(r.id, 'rejected')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-400">
                      <XCircle size={13} /> 却下
                    </button>
                    <button onClick={() => setReviewing(null)}
                      className="px-3 py-2 border text-xs rounded-lg hover:bg-gray-50">戻る</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setReviewing(r.id); setComment('') }}
                  className="w-full py-1.5 border border-orange-300 text-orange-700 text-xs font-bold rounded-lg hover:bg-orange-100 transition-colors">
                  審査する
                </button>
              )}
            </div>
          ))}

          {/* 処理済み */}
          {resolved.length > 0 && (
            <details className="group">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 py-1">
                処理済み {resolved.length}件を表示
              </summary>
              <div className="mt-2 space-y-2">
                {resolved.map(r => (
                  <div key={r.id} className={`rounded-xl p-3 border text-xs space-y-1 ${
                    r.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex justify-between">
                      <span className="font-bold">{r.sales_reps?.name}</span>
                      <span className={`font-bold ${r.status === 'approved' ? 'text-green-700' : 'text-gray-500'}`}>
                        {r.status === 'approved' ? '✅ 承認' : '❌ 却下'}
                      </span>
                    </div>
                    <p className="text-gray-500">{r.original_date} / {r.reason}</p>
                    {r.reviewer_comment && <p className="text-gray-500">備考: {r.reviewer_comment}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
