'use client'

import { useState } from 'react'
import { DailyRecord } from '@/lib/supabase'

type Props = {
  repName: string
  selectedDate: string
  record: Partial<DailyRecord>
  onClose: () => void
}

type ReportData = {
  name: string
  workTime: string
  visits: string
  netMeetings: string
  ownerMeetings: string
  negotiations: string
  acquisitions: string
  acquisitionArea: string
  acquisitionCase: string
  lostCase: string
  remainingWork: string
  goodPoints: string
  issues: string
  improvements: string
  learnings: string
  gratitude: string
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

type QuestionDef = {
  key: keyof ReportData
  label: string
  type: 'text' | 'number' | 'textarea'
  placeholder: string
  optional?: boolean
}

const QUESTIONS: QuestionDef[] = [
  { key: 'name',            label: '名前',                    type: 'text',     placeholder: '名前を入力' },
  { key: 'workTime',        label: '稼働時間',                type: 'text',     placeholder: '例: 09:00〜21:00' },
  { key: 'visits',          label: '訪問数',                  type: 'number',   placeholder: '0' },
  { key: 'netMeetings',     label: 'ネット対面数',            type: 'number',   placeholder: '0' },
  { key: 'ownerMeetings',   label: '主権対面数',              type: 'number',   placeholder: '0' },
  { key: 'negotiations',    label: '商談数',                  type: 'number',   placeholder: '0' },
  { key: 'acquisitions',    label: '獲得数',                  type: 'number',   placeholder: '0' },
  { key: 'acquisitionArea', label: '獲得エリア',              type: 'text',     placeholder: '例: 大阪府 堺市' },
  { key: 'acquisitionCase', label: '獲得案件',                type: 'textarea', placeholder: '案件の内容を入力（なければ「なし」）' },
  { key: 'lostCase',        label: '失注案件',                type: 'textarea', placeholder: '失注案件があれば入力（なければ「なし」）' },
  { key: 'remainingWork',   label: '残稼働',                  type: 'text',     placeholder: '例: 残5日' },
  { key: 'goodPoints',      label: 'よかった点',              type: 'textarea', placeholder: '今日のよかった点を入力' },
  { key: 'issues',          label: '課題・失敗',              type: 'textarea', placeholder: '課題や失敗を入力' },
  { key: 'improvements',    label: '明日の改善ポイント',      type: 'textarea', placeholder: '明日に活かす改善ポイントを入力' },
  { key: 'learnings',       label: '学び・知らなかったこと',  type: 'textarea', placeholder: '今日の学びや気づきを入力' },
  { key: 'gratitude',       label: '感謝・シェアしたいこと',  type: 'textarea', placeholder: '（任意）感謝やシェアしたいことがあれば', optional: true },
]

function buildAreaString(record: Partial<DailyRecord>): string {
  const list = record.area_list as { pref: string; city: string }[] | undefined
  if (list && list.length > 0) {
    return list.filter(a => a.pref).map(a => `${a.pref} ${a.city}`.trim()).join('、')
  }
  const pref = (record as any).area_pref || ''
  const city = (record as any).area_city || ''
  return pref ? `${pref} ${city}`.trim() : ''
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = DOW_JA[d.getDay()]
  return `${m}月${day}日（${dow}）`
}

export default function DailyReportForm({ repName, selectedDate, record, onClose }: Props) {
  const workTime = (() => {
    const s = (record as any).work_time_start || ''
    const e = (record as any).work_time_end || ''
    return s && e ? `${s}〜${e}` : ''
  })()

  const [data, setData] = useState<ReportData>({
    name:            repName,
    workTime,
    visits:          String((record.visits as number) || 0),
    netMeetings:     String((record.net_meetings as number) || 0),
    ownerMeetings:   String((record.owner_meetings as number) || 0),
    negotiations:    String((record.negotiations as number) || 0),
    acquisitions:    String((record.acquisitions as number) || 0),
    acquisitionArea: buildAreaString(record),
    acquisitionCase: '',
    lostCase:        '',
    remainingWork:   '',
    goodPoints:      '',
    issues:          '',
    improvements:    '',
    learnings:       '',
    gratitude:       '',
  })

  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState(false)
  const isDone = step >= QUESTIONS.length

  const current = QUESTIONS[step]

  function setValue(val: string) {
    setData(prev => ({ ...prev, [current.key]: val }))
  }

  function next() {
    if (step < QUESTIONS.length - 1) setStep(s => s + 1)
    else setStep(QUESTIONS.length)
  }

  function back() {
    if (step > 0) setStep(s => s - 1)
  }

  function buildReport(): string {
    const dateHeader = formatDateHeader(selectedDate)
    const lines: string[] = []
    lines.push(`🗓 日報｜${dateHeader}】毎日23：59まで`)
    lines.push('')
    lines.push(`🧑‍💼 名前：${data.name}`)
    lines.push('')
    lines.push(`🕒 稼働時間：${data.workTime}`)
    lines.push('')
    lines.push(`訪問数：${data.visits}`)
    lines.push(`ネット対面：${data.netMeetings}`)
    lines.push(`主権対面：${data.ownerMeetings}`)
    lines.push(`商談：${data.negotiations}`)
    lines.push(`獲得：${data.acquisitions}`)
    lines.push('')
    lines.push(`獲得エリア：${data.acquisitionArea}`)
    lines.push(`獲得案件：${data.acquisitionCase}`)
    lines.push(`失注案件：${data.lostCase}`)
    lines.push(`残稼働：${data.remainingWork}`)
    lines.push('')
    lines.push('💡 よかった点')
    lines.push(`→ ${data.goodPoints}`)
    lines.push('')
    lines.push('❌ 課題・失敗')
    lines.push(`→ ${data.issues}`)
    lines.push('')
    lines.push('🔁 明日の改善ポイント')
    lines.push(`→ ${data.improvements}`)
    lines.push('')
    lines.push('📝 学び・気づき')
    lines.push(`→ ${data.learnings}`)
    if (data.gratitude) {
      lines.push('')
      lines.push('👏 感謝・シェアしたいこと')
      lines.push(`→ ${data.gratitude}`)
    }
    return lines.join('\n')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildReport())
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const progress = isDone ? 100 : Math.round((step / QUESTIONS.length) * 100)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900" style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div>
          <div className="text-xs text-slate-400 font-medium">日報作成</div>
          <div className="text-sm font-black text-white">{formatDateHeader(selectedDate)}</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-black w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-700 transition-all">×</button>
      </div>

      {/* プログレスバー */}
      <div className="h-1 bg-slate-700">
        <div className="h-1 bg-blue-500 transition-all duration-300" style={{width: `${progress}%`}} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {!isDone ? (
          <div className="p-4">
            {/* ステップ表示 */}
            <div className="text-xs text-slate-500 font-bold mb-1">{step + 1} / {QUESTIONS.length}</div>

            {/* 質問 */}
            <div className="text-xl font-black text-white mb-1">
              {current.label}
              {current.optional && <span className="text-sm font-medium text-slate-400 ml-2">（任意）</span>}
            </div>

            {/* 入力 */}
            <div className="mt-4">
              {current.type === 'textarea' ? (
                <textarea
                  autoFocus
                  value={data[current.key]}
                  onChange={e => setValue(e.target.value)}
                  placeholder={current.placeholder}
                  rows={4}
                  className="w-full bg-slate-800 border-2 border-slate-600 focus:border-blue-500 rounded-2xl px-4 py-3 text-white text-base placeholder-slate-500 outline-none resize-none transition-colors"
                />
              ) : current.type === 'number' ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={data[current.key]}
                  onChange={e => setValue(e.target.value)}
                  placeholder={current.placeholder}
                  className="w-full bg-slate-800 border-2 border-slate-600 focus:border-blue-500 rounded-2xl px-4 py-4 text-white text-3xl font-black placeholder-slate-600 outline-none text-center transition-colors"
                />
              ) : (
                <input
                  autoFocus
                  type="text"
                  value={data[current.key]}
                  onChange={e => setValue(e.target.value)}
                  placeholder={current.placeholder}
                  onKeyDown={e => e.key === 'Enter' && next()}
                  className="w-full bg-slate-800 border-2 border-slate-600 focus:border-blue-500 rounded-2xl px-4 py-4 text-white text-base placeholder-slate-500 outline-none transition-colors"
                />
              )}
            </div>

            {/* 前の回答プレビュー */}
            {step > 0 && (
              <div className="mt-6 space-y-1">
                {QUESTIONS.slice(Math.max(0, step - 3), step).map(q => (
                  <div key={q.key} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="font-bold flex-shrink-0">{q.label}:</span>
                    <span className="truncate">{data[q.key] || '（未入力）'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 完成画面 */
          <div className="p-4">
            <div className="text-emerald-400 font-black text-lg mb-1">✅ 日報完成！</div>
            <div className="text-xs text-slate-400 mb-3">コピーしてLINEに貼り付けてください</div>
            <pre className="bg-slate-800 rounded-2xl p-4 text-sm text-slate-200 whitespace-pre-wrap font-sans leading-relaxed border border-slate-700">
              {buildReport()}
            </pre>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="px-4 py-3 border-t border-slate-700 flex gap-2">
        {!isDone ? (
          <>
            {step > 0 && (
              <button onClick={back}
                className="flex-shrink-0 px-5 py-3 rounded-2xl bg-slate-700 text-white font-bold text-base hover:bg-slate-600 transition-all">
                ‹ 戻る
              </button>
            )}
            <button onClick={next}
              className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-black text-base hover:bg-blue-500 transition-all">
              {step === QUESTIONS.length - 1 ? '日報を作成する 🎉' : `次へ › （${step + 2}/${QUESTIONS.length}）`}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setStep(QUESTIONS.length - 1)}
              className="flex-shrink-0 px-5 py-3 rounded-2xl bg-slate-700 text-white font-bold text-base hover:bg-slate-600 transition-all">
              ‹ 修正
            </button>
            <button onClick={handleCopy}
              className={`flex-1 py-3 rounded-2xl font-black text-base transition-all ${
                copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'
              }`}>
              {copied ? '✅ コピーしました！' : '📋 LINEにコピー'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
