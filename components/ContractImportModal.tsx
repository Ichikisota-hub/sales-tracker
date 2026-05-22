'use client'

import { useState, useRef } from 'react'

// ブラウザ側でPDFテキストを抽出（pdfjs-dist使用）
async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  // workerを無効化（Next.js環境での問題回避）
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, isEvalSupported: false }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => item.str || '')
      .join(' ')
    fullText += pageText + '\n'
  }
  return fullText
}

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
  const [tab, setTab] = useState<'pdf' | 'rakuraku' | 'sheet'>('pdf')
  const [step, setStep] = useState<'idle' | 'select_rep' | 'preview' | 'done'>('idle')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [allRows, setAllRows] = useState<ImportRow[]>([])
  const [sheetName, setSheetName] = useState('')
  const [selectedReps, setSelectedReps] = useState<Set<string>>(new Set())

  // 楽楽販売CSVインポート用state
  const fileRef = useRef<HTMLInputElement>(null)
  const [rakurakuStep, setRakurakuStep] = useState<'idle' | 'preview' | 'done'>('idle')
  const [rakurakuPreview, setRakurakuPreview] = useState<any[]>([])
  const [rakurakuTotalRows, setRakurakuTotalRows] = useState(0)
  const [rakurakuLoading, setRakurakuLoading] = useState(false)
  const [rakurakuResult, setRakurakuResult] = useState<{ imported: number; skipped: string[] } | null>(null)
  const [rakurakuFile, setRakurakuFile] = useState<File | null>(null)
  const [rakurakuError, setRakurakuError] = useState('')

  async function handleRakurakuFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRakurakuFile(file)
    setRakurakuLoading(true)
    setRakurakuError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('preview', 'true')
      const res = await fetch('/api/contracts/import-rakuraku', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setRakurakuError(json.error || 'エラー'); setRakurakuLoading(false); return }
      setRakurakuPreview(json.preview || [])
      setRakurakuTotalRows(json.total_rows || 0)
      setRakurakuStep('preview')
    } catch (e: any) { setRakurakuError(e.message) }
    setRakurakuLoading(false)
  }

  async function doRakurakuImport() {
    if (!rakurakuFile) return
    setRakurakuLoading(true)
    setRakurakuError('')
    try {
      const fd = new FormData()
      fd.append('file', rakurakuFile)
      const res = await fetch('/api/contracts/import-rakuraku', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setRakurakuError(json.error || 'エラー'); setRakurakuLoading(false); return }
      setRakurakuResult({ imported: json.imported, skipped: json.skipped || [] })
      setRakurakuStep('done')
      onImported()
    } catch (e: any) { setRakurakuError(e.message) }
    setRakurakuLoading(false)
  }

  // PDF（楽楽販売）インポート用state
  const pdfFileRef = useRef<HTMLInputElement>(null)
  const [pdfStep, setPdfStep] = useState<'idle' | 'preview' | 'done'>('idle')
  const [pdfPreview, setPdfPreview] = useState<any[]>([])
  const [pdfTotalRows, setPdfTotalRows] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfResult, setPdfResult] = useState<{ imported: number; skipped: string[] } | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfError, setPdfError] = useState('')
  const [rawTextSample, setRawTextSample] = useState('')

  const [pdfText, setPdfText] = useState('')  // ブラウザ抽出テキストを保持

  async function handlePdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfFile(file)
    setPdfLoading(true)
    setPdfError('')
    try {
      // ブラウザ側でPDFテキストを抽出（ファイル本体はサーバーに送らない）
      const extractedText = await extractTextFromPdf(file)
      setPdfText(extractedText)

      const res = await fetch('/api/contracts/import-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText, preview: true }),
      })
      const text = await res.text()
      let json: any
      try { json = JSON.parse(text) } catch { setPdfError(`サーバーエラー: ${text.slice(0,200)}`); setPdfLoading(false); return }
      if (!res.ok) { setPdfError(json.error || 'エラー'); setPdfLoading(false); return }
      setPdfPreview(json.preview || [])
      setPdfTotalRows(json.total_rows || 0)
      setRawTextSample(json.raw_text_sample || '')
      setPdfStep('preview')
    } catch (e: any) { setPdfError(`PDF読み込みエラー: ${e.message}`) }
    setPdfLoading(false)
  }

  async function doPdfImport() {
    if (!pdfText) return
    setPdfLoading(true)
    setPdfError('')
    try {
      const res = await fetch('/api/contracts/import-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pdfText }),
      })
      const json = await res.json()
      if (!res.ok) { setPdfError(json.error || 'エラー'); setPdfLoading(false); return }
      setPdfResult({ imported: json.imported, skipped: json.skipped || [] })
      setPdfStep('done')
      onImported()
    } catch (e: any) { setPdfError(e.message) }
    setPdfLoading(false)
  }

  const [result, setResult] = useState<{ imported: number; skipped: string[] } | null>(null)
  const [error, setError] = useState('')

  // スプレッドシートから全データ取得
  async function fetchAll() {
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
      const rows: ImportRow[] = json.rows || []
      setAllRows(rows)
      setSheetName(json.sheetName || '')
      setSelectedReps(new Set())
      setStep('select_rep')
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました')
    }
    setLoading(false)
  }

  // 選択された担当者でフィルターしたrows
  const filteredRows = allRows.filter(r => selectedReps.has(r.rep_name))

  // スプレッドシート内の担当者一覧（件数付き）
  const repList = Array.from(
    allRows.reduce((map, r) => {
      const name = r.rep_name || '（担当者未設定）'
      map.set(name, (map.get(name) || 0) + 1)
      return map
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1])  // 件数降順

  function toggleRep(name: string) {
    setSelectedReps(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAll() {
    setSelectedReps(new Set(repList.map(([name]) => name)))
  }

  function clearAll() {
    setSelectedReps(new Set())
  }

  // インポート実行
  async function doImport() {
    setImporting(true)
    setError('')
    try {
      const res = await fetch('/api/contracts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: filteredRows }),
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-0">
      <div className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* ヘッダー */}
        <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-black text-slate-800">📥 契約台帳インポート</div>
              {tab === 'sheet' && sheetName && <div className="text-xs text-slate-400 mt-0.5">シート: {sheetName}</div>}
            </div>
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 text-lg font-bold">✕</button>
          </div>

          {/* タブ切り替え */}
          <div className="flex gap-2 mt-3">
            {([['pdf','楽楽販売PDF'],['rakuraku','楽楽販売CSV'],['sheet','スプレッドシート']] as [string,string][]).map(([t,label])=>(
              <button key={t} onClick={()=>setTab(t as 'pdf'|'sheet'|'rakuraku')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${tab===t?'bg-blue-600 text-white':'bg-slate-100 text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ステップインジケーター */}
          {step !== 'idle' && step !== 'done' && (
            <div className="flex items-center gap-1 mt-3">
              {(['select_rep', 'preview'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                    step === s ? 'bg-blue-600 text-white' :
                    (step === 'preview' && s === 'select_rep') ? 'bg-emerald-500 text-white' :
                    'bg-slate-200 text-slate-400'
                  }`}>{i + 1}</div>
                  <span className={`text-xs font-bold ${step === s ? 'text-blue-600' : 'text-slate-400'}`}>
                    {s === 'select_rep' ? '担当者を選ぶ' : 'プレビュー'}
                  </span>
                  {i < 1 && <div className="w-4 h-px bg-slate-200 mx-1" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ══ 楽楽販売PDFタブ ══ */}
          {tab === 'pdf' && (
            <div className="space-y-4">
              {pdfError && (
                <div className="bg-red-50 border border-red-300 text-red-700 text-sm font-bold rounded-xl px-4 py-3">⚠️ {pdfError}</div>
              )}
              {pdfStep === 'idle' && (
                <div className="text-center py-8 space-y-4">
                  <div className="text-4xl">📄</div>
                  <div className="text-sm text-slate-600">
                    auひかり楽楽販売からダウンロードした<br /><strong>PDFファイル</strong>を選択してください
                  </div>
                  <input ref={pdfFileRef} type="file" accept=".pdf" onChange={handlePdfFile} className="hidden" />
                  <button onClick={() => pdfFileRef.current?.click()} disabled={pdfLoading}
                    className="bg-blue-600 text-white font-black text-base px-8 py-3 rounded-2xl disabled:opacity-50 transition-all active:scale-95">
                    {pdfLoading ? '解析中...' : 'PDFファイルを選択'}
                  </button>
                </div>
              )}
              {pdfStep === 'preview' && (
                <>
                  {pdfTotalRows === 0 ? (
                    <div className="space-y-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                        ⚠️ 担当者名のある契約データが自動抽出できませんでした。<br />
                        <span className="text-xs mt-1 block">PDFの形式によっては手動確認が必要です。</span>
                      </div>
                      {rawTextSample && (
                        <div>
                          <div className="text-xs font-bold text-slate-500 mb-1">抽出されたテキスト（先頭2000文字）:</div>
                          <pre className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 overflow-x-auto max-h-40 whitespace-pre-wrap">{rawTextSample}</pre>
                        </div>
                      )}
                      <button onClick={() => { setPdfStep('idle'); setPdfFile(null); if(pdfFileRef.current) pdfFileRef.current.value='' }}
                        className="w-full py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm">
                        別のファイルを選択
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                        <strong>{pdfTotalRows}件</strong>の契約データを検出。先頭{Math.min(10, pdfTotalRows)}件のプレビュー：
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-100">
                              {['担当者','顧客名','電話','都道府県','申込日'].map(h=>(
                                <th key={h} className="px-2 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pdfPreview.map((row, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-2 py-1.5 whitespace-nowrap">{row._rep_name || '—'}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.customer_name}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.phone || '—'}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.area_pref || '—'}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{row.acquired_date || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2 pb-4">
                        <button onClick={() => { setPdfStep('idle'); setPdfFile(null); if(pdfFileRef.current) pdfFileRef.current.value='' }}
                          className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm">ファイルを変更</button>
                        <button onClick={doPdfImport} disabled={pdfLoading}
                          className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm disabled:opacity-50 active:scale-95 transition-all">
                          {pdfLoading ? 'インポート中...' : `${pdfTotalRows}件を取り込む`}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              {pdfStep === 'done' && pdfResult && (
                <div className="text-center py-8 space-y-4">
                  <div className="text-5xl">✅</div>
                  <div className="text-xl font-black text-slate-800">{pdfResult.imported}件 インポート完了</div>
                  {pdfResult.skipped.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-left">
                      <div className="text-sm font-bold text-amber-700 mb-1">スキップ {pdfResult.skipped.length}件</div>
                      <ul className="text-xs text-amber-600 space-y-0.5">{pdfResult.skipped.map((s,i)=><li key={i}>• {s}</li>)}</ul>
                    </div>
                  )}
                  <button onClick={onClose} className="bg-slate-800 text-white font-black text-base px-8 py-3 rounded-2xl active:scale-95 transition-all">閉じる</button>
                </div>
              )}
            </div>
          )}

          {/* ══ 楽楽販売CSVタブ ══ */}
          {tab === 'rakuraku' && (
            <div className="space-y-4">
              {rakurakuError && (
                <div className="bg-red-50 border border-red-300 text-red-700 text-sm font-bold rounded-xl px-4 py-3">⚠️ {rakurakuError}</div>
              )}

              {rakurakuStep === 'idle' && (
                <div className="text-center py-8 space-y-4">
                  <div className="text-4xl">📂</div>
                  <div className="text-sm text-slate-600">
                    楽楽販売からダウンロードしたCSVファイルを選択してください
                  </div>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleRakurakuFile} className="hidden" />
                  <button onClick={() => fileRef.current?.click()} disabled={rakurakuLoading}
                    className="bg-blue-600 text-white font-black text-base px-8 py-3 rounded-2xl disabled:opacity-50 transition-all active:scale-95">
                    {rakurakuLoading ? '読み込み中...' : 'CSVファイルを選択'}
                  </button>
                </div>
              )}

              {rakurakuStep === 'preview' && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                    合計 <strong>{rakurakuTotalRows}件</strong> のデータを検出。先頭5件のプレビュー：
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100">
                          {['担当者','顧客名','電話','住所','プロバイダ','申込日'].map(h=>(
                            <th key={h} className="px-2 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rakurakuPreview.map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 whitespace-nowrap">{row._rep_name || '—'}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{row.customer_name}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{row.phone || '—'}</td>
                            <td className="px-2 py-1.5 max-w-[120px] truncate">{row.address || '—'}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{row.wifi_provider || '—'}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{row.acquired_date || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 pb-4">
                    <button onClick={() => { setRakurakuStep('idle'); setRakurakuFile(null); if(fileRef.current) fileRef.current.value='' }}
                      className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm">
                      ファイルを変更
                    </button>
                    <button onClick={doRakurakuImport} disabled={rakurakuLoading}
                      className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm disabled:opacity-50 active:scale-95 transition-all">
                      {rakurakuLoading ? 'インポート中...' : `${rakurakuTotalRows}件を取り込む`}
                    </button>
                  </div>
                </>
              )}

              {rakurakuStep === 'done' && rakurakuResult && (
                <div className="text-center py-8 space-y-4">
                  <div className="text-5xl">✅</div>
                  <div className="text-xl font-black text-slate-800">{rakurakuResult.imported}件 インポート完了</div>
                  {rakurakuResult.skipped.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-left">
                      <div className="text-sm font-bold text-amber-700 mb-1">担当者未登録でスキップ {rakurakuResult.skipped.length}件</div>
                      <ul className="text-xs text-amber-600 space-y-0.5">{rakurakuResult.skipped.map((s,i)=><li key={i}>• {s}</li>)}</ul>
                    </div>
                  )}
                  <button onClick={onClose} className="bg-slate-800 text-white font-black text-base px-8 py-3 rounded-2xl active:scale-95 transition-all">閉じる</button>
                </div>
              )}
            </div>
          )}

          {/* ══ スプレッドシートタブ ══ */}
          {tab === 'sheet' && <>
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-sm font-bold rounded-xl px-4 py-3">
              ⚠️ {error}
            </div>
          )}

          {/* ── Step 1: idle ── */}
          {step === 'idle' && (
            <div className="text-center py-8 space-y-4">
              <div className="text-4xl">📊</div>
              <div className="text-sm text-slate-600">
                Googleスプレッドシートのデータを読み込み、<br />担当者を選んで取り込みます
              </div>
              <button onClick={fetchAll} disabled={loading}
                className="bg-blue-600 text-white font-black text-base px-8 py-3 rounded-2xl disabled:opacity-50 transition-all active:scale-95">
                {loading ? '読み込み中...' : 'データを読み込む'}
              </button>
            </div>
          )}

          {/* ── Step 2: 担当者選択 ── */}
          {step === 'select_rep' && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm font-black text-slate-700">
                  担当者を選択 <span className="text-slate-400 font-normal">（全{allRows.length}件）</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={selectAll}
                    className="text-xs text-blue-600 font-bold px-2 py-1 rounded-lg hover:bg-blue-50">
                    全選択
                  </button>
                  <button onClick={clearAll}
                    className="text-xs text-slate-500 font-bold px-2 py-1 rounded-lg hover:bg-slate-50">
                    クリア
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {repList.map(([name, count]) => {
                  const checked = selectedReps.has(name)
                  const isUnknown = name === '（担当者未設定）'
                  return (
                    <button key={name} onClick={() => !isUnknown && toggleRep(name)}
                      disabled={isUnknown}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all ${
                        isUnknown ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed' :
                        checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'
                      }`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                        checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`}>
                        {checked && <span className="text-white text-xs font-black">✓</span>}
                      </div>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 ${
                        isUnknown ? 'bg-slate-300' : 'bg-slate-600'
                      }`}>
                        {isUnknown ? '?' : name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{name}</div>
                      </div>
                      <div className={`text-sm font-black flex-shrink-0 ${checked ? 'text-blue-600' : 'text-slate-400'}`}>
                        {count}件
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2 pb-4">
                <button onClick={() => setStep('idle')}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm">
                  戻る
                </button>
                <button
                  onClick={() => setStep('preview')}
                  disabled={selectedReps.size === 0}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm disabled:opacity-40 active:scale-95 transition-all">
                  {selectedReps.size > 0
                    ? `${filteredRows.length}件を確認する →`
                    : '担当者を選んでください'}
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: プレビュー ── */}
          {step === 'preview' && (
            <>
              {/* 選択中の担当者 */}
              <div className="bg-blue-50 rounded-2xl px-4 py-3">
                <div className="text-xs font-bold text-blue-600 mb-1.5">選択中の担当者</div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(selectedReps).map(name => (
                    <span key={name} className="text-xs bg-blue-600 text-white font-bold px-2.5 py-1 rounded-full">
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              {/* 件数 */}
              <div className="bg-emerald-50 rounded-2xl px-4 py-3">
                <div className="text-sm font-black text-emerald-700">{filteredRows.length}件 取り込み予定</div>
                <div className="text-xs text-emerald-600 mt-0.5">以下の内容でインポートされます</div>
              </div>

              {/* データ一覧 */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredRows.slice(0, 30).map((r, i) => (
                  <div key={i} className="border border-slate-100 rounded-xl px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="font-black text-slate-800 flex-1 truncate">{r.customer_name}</div>
                      <div className="text-xs text-slate-400 flex-shrink-0">{r.rep_name}</div>
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
                {filteredRows.length > 30 && (
                  <div className="text-center text-xs text-slate-400 py-2">
                    ...他 {filteredRows.length - 30} 件
                  </div>
                )}
              </div>

              <div className="flex gap-2 pb-4">
                <button onClick={() => setStep('select_rep')}
                  className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm">
                  担当者を変更
                </button>
                <button onClick={doImport} disabled={importing}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm disabled:opacity-50 active:scale-95 transition-all">
                  {importing ? 'インポート中...' : `${filteredRows.length}件を取り込む`}
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: 完了 ── */}
          {step === 'done' && result && (
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">✅</div>
              <div className="text-xl font-black text-slate-800">{result.imported}件 インポート完了</div>
              {result.skipped.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-left">
                  <div className="text-sm font-bold text-amber-700 mb-1">
                    スキップ {result.skipped.length}件
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
          </>}
        </div>
      </div>
    </div>
  )
}
