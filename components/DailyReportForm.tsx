'use client'

import { useEffect, useState } from 'react'
import { supabase, DailyRecord } from '@/lib/supabase'
import { syncSheets } from '@/lib/syncSheets'

type Props = {
  repId: string
  repName: string
  selectedDate: string
  record: Partial<DailyRecord>
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'; el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus(); el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch { return false }
  }
}

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

export default function DailyReportForm({ repId, repName, selectedDate, record }: Props) {
  const [acquisitionCase, setAcquisitionCase] = useState('')
  const [lostCase, setLostCase] = useState('')
  const [remainingWork, setRemainingWork] = useState('')
  const [goodPoints, setGoodPoints] = useState('')
  const [issues, setIssues] = useState('')
  const [improvements, setImprovements] = useState('')
  const [learnings, setLearnings] = useState('')
  const [gratitude, setGratitude] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [reportText, setReportText] = useState('')

  // 日付・担当者が変わるたびに既存データを読み込む
  useEffect(() => {
    async function load() {
      const [reportData, scheduleData] = await Promise.all([
        supabase
          .from('daily_reports')
          .select('*')
          .eq('sales_rep_id', repId)
          .eq('report_date', selectedDate)
          .single(),
        supabase
          .from('work_schedules')
          .select('schedule_date')
          .eq('sales_rep_id', repId)
          .eq('work_status', '稼働')
          .gt('schedule_date', selectedDate)
          .gte('schedule_date', `${selectedDate.slice(0, 7)}-01`)
          .lte('schedule_date', (() => { const [y,m] = selectedDate.slice(0,7).split('-'); const d = new Date(parseInt(y), parseInt(m), 0).getDate(); return `${y}-${m}-${String(d).padStart(2,'0')}` })()),
      ])

      const remaining = scheduleData.data?.length ?? 0
      const autoRemaining = `残${remaining}日`

      const data = reportData.data
      if (data) {
        setAcquisitionCase(data.acquisition_case || '')
        setLostCase(data.lost_case || '')
        setRemainingWork(data.remaining_work || autoRemaining)
        setGoodPoints(data.good_points || '')
        setIssues(data.issues || '')
        setImprovements(data.improvements || '')
        setLearnings(data.learnings || '')
        setGratitude(data.gratitude || '')
      } else {
        setAcquisitionCase('')
        setLostCase('')
        setRemainingWork(autoRemaining)
        setGoodPoints('')
        setIssues('')
        setImprovements('')
        setLearnings('')
        setGratitude('')
      }
      setSaved(false)
    }
    load()
  }, [repId, selectedDate])

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
    lines.push(`インターホンのみ：${(record.interphone_only as number) || 0}`)
    lines.push(`対面数：${(record.net_meetings as number) || 0}`)
    lines.push(`紙プレ：${(record.paper_presentation as number) || 0}`)
    lines.push(`フルトーク：${(record.full_talk as number) || 0}`)
    lines.push(`宅内IN：${(record.indoor_entry as number) || 0}`)
    lines.push(`商談：${(record.negotiations as number) || 0}`)
    lines.push(`見込み：${(record.prospects as number) || 0}`)
    lines.push(`受注：${(record.acquisitions as number) || 0}`)
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

  async function handleSaveAndCopy() {
    setSaving(true)
    setCopyFailed(false)
    try {
      const payload = {
        sales_rep_id: repId,
        report_date: selectedDate,
        acquisition_case: acquisitionCase,
        lost_case: lostCase,
        remaining_work: remainingWork,
        good_points: goodPoints,
        issues,
        improvements,
        learnings,
        gratitude,
        visits:              (record.visits              as number) || 0,
        interphone_only:     (record.interphone_only     as number) || 0,
        net_meetings:        (record.net_meetings        as number) || 0,
        paper_presentation:  (record.paper_presentation  as number) || 0,
        full_talk:           (record.full_talk           as number) || 0,
        indoor_entry:        (record.indoor_entry        as number) || 0,
        owner_meetings:      (record.owner_meetings      as number) || 0,
        negotiations:        (record.negotiations        as number) || 0,
        prospects:           (record.prospects           as number) || 0,
        acquisitions:        (record.acquisitions        as number) || 0,
        updated_at: new Date().toISOString(),
      }
      await supabase
        .from('daily_reports')
        .upsert(payload, { onConflict: 'sales_rep_id,report_date' })
      setSaved(true)
      syncSheets()
      const text = buildReport()
      const ok = await copyToClipboard(text)
      if (ok) {
        setCopied(true)
      } else {
        setCopyFailed(true)
        setReportText(text)
      }
      setTimeout(() => { setSaved(false); setCopied(false) }, 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ReportCard
      acquisitionCase={acquisitionCase} setAcquisitionCase={setAcquisitionCase}
      lostCase={lostCase} setLostCase={setLostCase}
      remainingWork={remainingWork} setRemainingWork={setRemainingWork}
      goodPoints={goodPoints} setGoodPoints={setGoodPoints}
      issues={issues} setIssues={setIssues}
      improvements={improvements} setImprovements={setImprovements}
      learnings={learnings} setLearnings={setLearnings}
      gratitude={gratitude} setGratitude={setGratitude}
      saving={saving} saved={saved} copyFailed={copyFailed} reportText={reportText}
      onSaveAndCopy={handleSaveAndCopy}
    />
  )
}

// ── コンポーネント外に切り出し（再レンダリングで消えるのを防ぐ） ──────────

type CardProps = {
  acquisitionCase: string; setAcquisitionCase: (v: string) => void
  lostCase: string;        setLostCase: (v: string) => void
  remainingWork: string;   setRemainingWork: (v: string) => void
  goodPoints: string;      setGoodPoints: (v: string) => void
  issues: string;          setIssues: (v: string) => void
  improvements: string;    setImprovements: (v: string) => void
  learnings: string;       setLearnings: (v: string) => void
  gratitude: string;       setGratitude: (v: string) => void
  saving: boolean; saved: boolean; copyFailed: boolean; reportText: string
  onSaveAndCopy: () => void
}

function ReportCard({
  acquisitionCase, setAcquisitionCase,
  lostCase, setLostCase,
  remainingWork, setRemainingWork,
  goodPoints, setGoodPoints,
  issues, setIssues,
  improvements, setImprovements,
  learnings, setLearnings,
  gratitude, setGratitude,
  saving, saved, copyFailed, reportText, onSaveAndCopy,
}: CardProps) {
  return (
    <div className="mobile-card">
      <div className="mobile-card-label text-lg">📝 日報</div>

      {/* 注意書き */}
      <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-3 py-3 mb-4 leading-relaxed">
        <p className="text-xs font-black text-amber-800">
          ⚠️ 成長するものは必ず毎日振り返りをします。その道具として利用してください。
          契約取れた時は取れたなりの理由があるので再現性を持たせるために自己分析をしっかり行い、
          質の良い日報にしてください。⚠️
        </p>
      </div>

      <div className="space-y-3">
        {/* 獲得案件 */}
        <Field
          label="🏠 獲得案件"
          value={acquisitionCase}
          onChange={setAcquisitionCase}
          placeholder="獲得案件の詳細を記入..."
          hint="どういったお客さんか・角度感はどうだったか・どこにフックがかかったか、詳細に書いてください"
          rows={3}
        />

        {/* 失注案件 */}
        <Field
          label="😞 失注案件"
          value={lostCase}
          onChange={setLostCase}
          placeholder="失注案件があれば詳細を記入（なければ「なし」）"
        />

        {/* 残稼働 */}
        <div>
          <div className="text-xs font-bold text-slate-600 mb-1">📅 残稼働</div>
          <input
            type="text"
            value={remainingWork}
            onChange={e => setRemainingWork(e.target.value)}
            placeholder="例: 残5日"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        <Field label="💡 よかった点"            value={goodPoints}   onChange={setGoodPoints}   placeholder="今日のよかった点を具体的に" />
        <Field label="❌ 課題・失敗"             value={issues}       onChange={setIssues}       placeholder="課題や失敗を正直に振り返る" />
        <Field label="🔁 明日の改善ポイント"     value={improvements} onChange={setImprovements} placeholder="明日に活かす具体的な改善点" />
        <Field label="📝 学び・知らなかったこと" value={learnings}    onChange={setLearnings}    placeholder="今日の学び・気づき・新発見" />
        <Field label="👏 感謝・シェアしたいこと" value={gratitude}    onChange={setGratitude}    placeholder="（任意）チームへのシェアや感謝" optional />

        <button
          onClick={onSaveAndCopy}
          disabled={saving}
          className={`w-full py-3 rounded-2xl font-black text-base transition-all shadow-md ${
            saved    ? 'bg-emerald-400 text-white' :
            saving   ? 'bg-emerald-300 text-white' :
            'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {saved ? '✅ 保存＆コピーしました！LINEに貼り付けてください' :
           saving ? '保存中...' :
           '📝 日報を作成する（保存＆コピー）'}
        </button>
        {copyFailed && (
          <div className="mt-2 text-xs text-red-600 font-bold bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            ⚠️ コピーに失敗しました。下のテキストを長押しして全選択→コピーしてください。
            <textarea
              readOnly
              value={reportText}
              className="mt-2 w-full text-xs text-gray-800 font-normal bg-white border border-red-200 rounded-lg p-2 resize-none"
              rows={10}
              onFocus={e => e.target.select()}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, optional, hint, rows = 2 }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  optional?: boolean
  hint?: string
  rows?: number
}) {
  return (
    <div>
      <div className="text-xs font-bold text-slate-600 mb-0.5">
        {label}{optional && <span className="ml-1 text-slate-400 font-normal">（任意）</span>}
      </div>
      {hint && (
        <div className="text-[11px] text-blue-600 font-medium bg-blue-50 rounded-lg px-2 py-1 mb-1 leading-relaxed">
          💬 {hint}
        </div>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300"
      />
    </div>
  )
}
