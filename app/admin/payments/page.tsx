'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

interface NotificationRow {
  id: string
  sales_rep_id: string
  period_year: number
  period_month: number
  opening_count: number
  cancel_count: number
  working_days: number
  net_amount: number
  cancel_rate_exceeded: boolean
  sent_at: string | null
  html_content: string | null
  sales_reps: { name: string; line_user_id: string | null }
}

interface GenerateResult {
  repId: string
  repName: string
  openingCount: number
  cancelCount: number
  cancelRateExceeded: boolean
  netAmount: number
  notificationId: string
}

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

export default function PaymentsPage() {
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth === 1 ? 12 : currentMonth - 1)
  const [generating, setGenerating] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [results, setResults] = useState<GenerateResult[]>([])
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [sendAll, setSendAll] = useState(false)
  const supabase = createClient()

  const loadNotifications = useCallback(async (y: number, m: number) => {
    const { data } = await supabase
      .from('payment_notifications')
      .select('*, sales_reps(name, line_user_id)')
      .eq('period_year', y)
      .eq('period_month', m)
      .order('created_at', { ascending: true })
    setNotifications((data ?? []) as NotificationRow[])
  }, [supabase])

  async function handleGenerate() {
    setGenerating(true)
    setResults([])
    const res = await fetch('/api/payments/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    const text = await res.text()
    let data: { ok: boolean; results: GenerateResult[]; error?: string }
    try {
      data = JSON.parse(text)
    } catch {
      alert(`APIエラー: ${text.slice(0, 200)}`)
      setGenerating(false)
      return
    }
    if (!data.ok) { alert(`エラー: ${data.error ?? 'Unknown'}`); setGenerating(false); return }
    setResults(data.results ?? [])
    await loadNotifications(year, month)
    setGenerating(false)
  }

  async function handleSendLine(notificationId: string) {
    setSending(notificationId)
    const res = await fetch('/api/payments/send-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (data.ok) {
      await loadNotifications(year, month)
    } else {
      alert(data.error ?? 'LINE送信に失敗しました')
    }
    setSending(null)
  }

  async function handleSendAll() {
    setSendAll(true)
    for (const n of notifications.filter(n => !n.sent_at && n.sales_reps?.line_user_id)) {
      await handleSendLine(n.id)
    }
    setSendAll(false)
  }

  const years = Array.from({ length: 3 }, (_, i) => currentYear - 1 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center gap-2">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm">← 組織管理</Link>
        <span className="text-slate-600">|</span>
        <h1 className="font-bold text-sm">支払通知書管理</h1>
      </div>

      <div className="p-4 max-w-4xl mx-auto space-y-4 mt-4">
        {/* 月選択 & 生成 */}
        <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-center gap-3">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm">
            {years.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm">
            {months.map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
          <button onClick={handleGenerate} disabled={generating}
            className="bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-800 disabled:opacity-50">
            {generating ? '計算中…' : '通知書を生成'}
          </button>
          <button onClick={() => loadNotifications(year, month)}
            className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            一覧を更新
          </button>
            <Link href="/admin/payments/settings"
            className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            ⚙ 支払設定
          </Link>
          {notifications.length > 0 && (
            <button onClick={handleSendAll} disabled={sendAll}
              className="ml-auto bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-600 disabled:opacity-50">
              {sendAll ? '送付中…' : '未送付を全員に送付'}
            </button>
          )}
        </div>

        {/* 生成結果サマリー */}
        {results.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-bold text-blue-900 mb-2">生成完了: {results.length}名</p>
            <div className="space-y-1">
              {results.map(r => (
                <div key={r.repId} className="text-xs flex gap-3">
                  <span className="font-medium w-20">{r.repName}</span>
                  <span>開通 {r.openingCount}件</span>
                  <span>キャンセル {r.cancelCount}件</span>
                  {r.cancelRateExceeded && <span className="text-red-600 font-bold">⚠️ 12%超過</span>}
                  <span className="font-bold text-blue-900">¥{r.netAmount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 通知書一覧 */}
        {notifications.length > 0 && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2 text-left">担当者</th>
                  <th className="px-3 py-2 text-center">開通</th>
                  <th className="px-3 py-2 text-center">キャンセル</th>
                  <th className="px-3 py-2 text-center">稼働日</th>
                  <th className="px-3 py-2 text-right">支払金額</th>
                  <th className="px-3 py-2 text-center">状態</th>
                  <th className="px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map(n => (
                  <tr key={n.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">
                      {n.sales_reps?.name}
                      {n.cancel_rate_exceeded && <span className="ml-1 text-xs text-red-600">⚠️12%超</span>}
                    </td>
                    <td className="px-3 py-2 text-center">{n.opening_count}件</td>
                    <td className="px-3 py-2 text-center">{n.cancel_count}件</td>
                    <td className="px-3 py-2 text-center">{n.working_days}日</td>
                    <td className="px-3 py-2 text-right font-bold">¥{n.net_amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      {n.sent_at
                        ? <span className="text-green-600 text-xs">送付済</span>
                        : <span className="text-orange-500 text-xs">未送付</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        {n.html_content && (
                          <button onClick={() => setPreviewHtml(n.html_content)}
                            className="text-xs px-2 py-1 border rounded hover:bg-gray-50">
                            プレビュー
                          </button>
                        )}
                        {!n.sales_reps?.line_user_id ? (
                          <span className="text-xs text-gray-400">LINE未設定</span>
                        ) : (
                          <button onClick={() => handleSendLine(n.id)}
                            disabled={sending === n.id}
                            className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50">
                            {sending === n.id ? '送付中…' : 'LINE送付'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {notifications.length === 0 && results.length === 0 && (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400 text-sm">
            月を選択して「通知書を生成」を押してください
          </div>
        )}
      </div>

      {/* プレビューモーダル */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <span className="font-bold text-sm">支払通知書プレビュー</span>
              <button onClick={() => setPreviewHtml(null)} className="text-gray-500 hover:text-gray-700 text-xl">×</button>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="flex-1 w-full"
              style={{ minHeight: '70vh' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
