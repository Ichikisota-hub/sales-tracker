'use client'

import { useState } from 'react'
import { DailyRecord } from '@/lib/supabase'

type Props = {
  repName: string
  selectedDate: string
  record: Partial<DailyRecord>
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日（${DOW_JA[d.getDay()]}）`
}

function buildAreaString(record: Partial<DailyRecord>): string {
  const list = record.area_list as { pref: string; city: string }[] | undefined
  if (list && list.length > 0) {
    return list.filter(a => a.pref).map(a => `${a.pref} ${a.city}`.trim()).join('、')
  }
  const pref = (record as any).area_pref || ''
  const city = (record as any).area_city || ''
  return pref ? `${pref} ${city}`.trim() : ''
}

export default function DailyReportForm({ repName, selectedDate, record }: Props) {
  const [acquisitionCase, setAcquisitionCase] = useState('')
  const [lostCase, setLostCase] = useState('')
  const [remainingWork, setRemainingWork] = useState('')
  const [goodPoints, setGoodPoints] = useState('')
  const [issues, setIssues] = useState('')
  const [improvements, setImprovements] = useState('')
  const [learnings, setLearnings] = useState('')
  const [gratitude, setGratitude] = useState('')
  const [copied, setCopied] = useState(false)

  const workStart = (record as any).work_time_start || ''
  const workEnd   = (record as any).work_time_end   || ''
  const workTime  = workStart && workEnd ? `${workStart}〜${workEnd}` : '未入力'

  function buildReport(): string {
    const lines: string[] = []
    lines.push(`🗓 日報｜${formatDateHeader(selectedDate)}】毎日23：59まで`)
    lines.push('')
    lines.push(`🧑‍💼 名前：${repName}`)
    lines.push('')
    lines.push(`🕒 稼働時間：${workTime}`)
    lines.push('')
    lines.push(`訪問数：${(record.visits as number) || 0}`)
    lines.push(`ネット対面：${(record.net_meetings as number) || 0}`)
    lines.push(`主権対面：${(record.owner_meetings as number) || 0}`)
    lines.push(`商談：${(record.negotiations as number) || 0}`)
    lines.push(`獲得：${(record.acquisitions as number) || 0}`)
    lines.push('')
    lines.push(`獲得エリア：${buildAreaString(record)}`)
    lines.push(`獲得案件：${acquisitionCase || 'なし'}`)
    lines.push(`失注案件：${lostCase || 'なし'}`)
    lines.push(`残稼働：${remainingWork}`)
    lines.push('')
    lines.push('💡 よかった点')
    lines.push(`→ ${goodPoints}`)
    lines.push('')
    lines.push('❌ 課題・失敗')
    lines.push(`→ ${issues}`)
    lines.push('')
    lines.push('🔁 明日の改善ポイント')
    lines.push(`→ ${improvements}`)
    lines.push('')
    lines.push('📝 学び・気づき')
    lines.push(`→ ${learnings}`)
    if (gratitude) {
      lines.push('')
      lines.push('👏 感謝・シェアしたいこと')
      lines.push(`→ ${gratitude}`)
    }
    return lines.join('\n')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildReport())
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const Field = ({ label, value, onChange, placeholder, optional }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder: string
    optional?: boolean
  }) => (
    <div>
      <div className="text-xs font-bold text-slate-500 mb-1">
        {label}{optional && <span className="ml-1 text-slate-400 font-normal">（任意）</span>}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300"
      />
    </div>
  )

  return (
    <div className="mobile-card">
      <div className="mobile-card-label text-lg">📝 日報</div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs font-bold text-slate-500 mb-1">獲得案件</div>
            <textarea
              value={acquisitionCase}
              onChange={e => setAcquisitionCase(e.target.value)}
              placeholder="案件内容（なければ空欄）"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 mb-1">失注案件</div>
            <textarea
              value={lostCase}
              onChange={e => setLostCase(e.target.value)}
              placeholder="失注案件（なければ空欄）"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-slate-500 mb-1">残稼働</div>
          <input
            type="text"
            value={remainingWork}
            onChange={e => setRemainingWork(e.target.value)}
            placeholder="例: 残5日"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        <Field label="💡 よかった点"          value={goodPoints}   onChange={setGoodPoints}   placeholder="今日のよかった点" />
        <Field label="❌ 課題・失敗"           value={issues}       onChange={setIssues}       placeholder="課題や失敗点" />
        <Field label="🔁 明日の改善ポイント"   value={improvements} onChange={setImprovements} placeholder="明日に活かすこと" />
        <Field label="📝 学び・知らなかったこと" value={learnings}  onChange={setLearnings}    placeholder="今日の学び・気づき" />
        <Field label="👏 感謝・シェアしたいこと" value={gratitude} onChange={setGratitude}    placeholder="任意" optional />

        <button
          onClick={handleCopy}
          className={`w-full py-3 rounded-2xl font-black text-base transition-all shadow-md ${
            copied
              ? 'bg-emerald-400 text-white'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {copied ? '✅ コピーしました！LINEに貼り付けてください' : '📝 日報を作成する'}
        </button>
      </div>
    </div>
  )
}
