'use client'

import { useState } from 'react'

type ImportRow = {
  rep_name: string
  customer_name: string
  phone: string
  address: string
  area_pref: string
  area_city: string
  wifi_provider: string
  acquired_date: string | null
  construction_date: string | null
  status: string
  notes: string
}

type Props = {
  onClose: () => void
  onImported: () => void
}

export default function ContractImportModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<'idle' | 'preview' | 'done'>('idle')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [sheetName, setSheetName] = useState('')
  const [colMap, setColMap] = useState<Record<string, number>>({})
  const [result, setResult] = useState<{ imported: number; skipped: string[] } | null>(null)
  const [error, setError] = useState('')

  async function fetchPreview() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/contracts/import')
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'データ取得に失敗しました')
        setLoading(false)
        return
      }
      setRows(json.rows || [])
      setSheetName(json.sheetName || '')
      setColMap(json.colMap || {})
      setStep('preview')
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました')
    }
    setLoading(false)
  }

  async function doImport() {
    setImporting(true)
    setError('')
    try {
      const res = await fetch('/api/contracts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'インポートに失敗しました')
        setImporting(false)
        return
      }
      setResult({ imported: json.imported, skipped: json.skipped || [] })
      setStep('done')
      onImported()
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました')
    }
    setImporting(false)
  }

  const detectedKeys = Object.keys(colMap)
  const FIELD_LABEL: Record<string, string> = {
    rep_name: '担当者',
    customer_name: '顧客名',
    phone: '電話番号',
    address: '住所',
    area_pref: '都道府県',
    area_city: '市区町村',
    wifi_provider: 'WiFi',
    acquired_date: '獲得日',
    construction_date: '工事日',
    status: 'ステータス',
    notes: 'メモ',
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-0">
      <div className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-black text-slate-800">📥 スプレッドシートから取り込み</div>
              {sheetName && (
                <div className="text-xs text-slate-400 mt-0.5">シート: {sheetName}</div>
              )}
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-lg font-bold">✕</button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-sm font-bold rounded-xl px-4 py-3">
              ⚠️ {error}
            </div>
          )}

          {/* ステップ: idle */}
          {step === 'idle' && (
            <div className="text-center py-8 space-y-4">
              <div className="text-4xl">📊</div>
              <div className="text-sm text-slate-600">
                設定済みのGoogleスプレッドシートから<br />契約宅データを取り込みます
              </div>
              <button
                onClick={fetchPreview}
                disabled={loading}
                className="bg-blue-600 text-white font-black text-base px-8 py-3 rounded-2xl disabled:opacity-50 transition-all active:scale-95"
              >
                {loading ? '読み込み中...' : 'データを読み込む'}
              </button>
            </div>
          )}

          {/* ステップ: preview */}
          {step === 'preview' && (
            <>
              {/* 検出した列マッピング */}
              {detectedKeys.length > 0 && (
                <div className="bg-slate-50 rounded-2xl p-3">
                  <div className="text-xs font-bold text-slate-500 mb-2">検出した列</div>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedKeys.map(k => (
                      <span key={k} className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-lg">
                        {FIELD_LABEL[k] || k}
                      </span>
                    ))}
                  </div>
                  {!colMap.rep_name && (
                    <div className="text-xs text-amber-600 font-bold mt-2">
                      ⚠️ 「担当者」列が検出できませんでした。担当者が空のデータはスキップされます
                    </div>
                  )}
                </div>
              )}

              {/* プレビュー件数 */}
              <div className="bg-emerald-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-emerald-700">{rows.length}件 取り込み可能</div>
                  <div className="text-xs text-emerald-600">顧客名が入力されている行のみ対象</div>
                </div>
              </div>

              {/* データプレビュー */}
              {rows.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {rows.slice(0, 20).map((r, i) => (
                    <div key={i} className="border border-slate-100 rounded-xl px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="font-black text-slate-800 flex-1 truncate">{r.customer_name}</div>
                        <div className="text-xs text-slate-400 flex-shrink-0">{r.rep_name || '担当者不明'}</div>
                      </div>
                      <div className="flex gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                        {r.phone && <span>📞 {r.phone}</span>}
                        {r.acquired_date && <span>獲得: {r.acquired_date}</span>}
                        {r.status && r.status !== '手続き中' && (
                          <span className="font-bold text-blue-600">{r.status}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {rows.length > 20 && (
                    <div className="text-center text-xs text-slate-400 py-2">
                      ...他 {rows.length - 20} 件
                    </div>
                  )}
                </div>
              )}

              {rows.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <div className="text-3xl mb-2">📭</div>
                  <div className="text-sm">取り込めるデータがありませんでした</div>
                </div>
              )}

              {/* ボタン */}
              <div className="flex gap-2 pb-4">
                <button onClick={() => setStep('idle')}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm">
                  戻る
                </button>
                {rows.length > 0 && (
                  <button onClick={doImport} disabled={importing}
                    className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm disabled:opacity-50 active:scale-95 transition-all">
                    {importing ? 'インポート中...' : `${rows.length}件を取り込む`}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ステップ: done */}
          {step === 'done' && result && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">✅</div>
              <div>
                <div className="text-xl font-black text-slate-800">{result.imported}件 インポート完了</div>
              </div>
              {result.skipped.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-left">
                  <div className="text-sm font-bold text-amber-700 mb-1">
                    スキップ {result.skipped.length}件（担当者名が一致しないなど）
                  </div>
                  <ul className="text-xs text-amber-600 space-y-0.5">
                    {result.skipped.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              )}
              <button onClick={onClose}
                className="bg-slate-800 text-white font-black text-base px-8 py-3 rounded-2xl active:scale-95 transition-all">
                閉じる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
