'use client'

import { useState } from 'react'
import { CalendarClock, Send } from 'lucide-react'

type Props = {
  repId: string
  organizationId: string
  currentDate: string // 変更したいシフトの日付
  onSubmitted?: () => void
}

export default function ShiftChangeRequestForm({ repId, organizationId, currentDate, onSubmitted }: Props) {
  const [open, setOpen] = useState(false)
  const [requestedDate, setRequestedDate] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return
    setSubmitting(true)

    const res = await fetch('/api/shifts/change-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterRepId: repId,
        organizationId,
        originalDate: currentDate,
        requestedDate: requestedDate || undefined,
        reason: reason.trim(),
      }),
    })

    if (res.ok) {
      setDone(true)
      setReason('')
      setRequestedDate('')
      setTimeout(() => { setDone(false); setOpen(false); onSubmitted?.() }, 2000)
    }
    setSubmitting(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-orange-600 border border-orange-200 bg-orange-50 px-3 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
      >
        <CalendarClock size={13} />
        シフト変更申請
      </button>
    )
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-orange-700 flex items-center gap-1.5">
          <CalendarClock size={15} />
          シフト変更申請 — {currentDate}
        </p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {done ? (
        <p className="text-center text-green-600 font-bold py-2">✅ 申請を送信しました。責任者にLINEで通知されます。</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">振替希望日（任意）</label>
            <input
              type="date"
              value={requestedDate}
              onChange={e => setRequestedDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">変更理由 <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="変更が必要な理由を入力してください"
              rows={3}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !reason.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors text-sm"
          >
            <Send size={14} />
            {submitting ? '送信中…' : '責任者に申請する'}
          </button>
        </form>
      )}
    </div>
  )
}
