'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { getMonthList, formatYearMonth } from '@/lib/dateUtils'
import SheetView from '@/components/SheetView'
import AnalysisView from '@/components/AnalysisView'
import RepSettings from '@/components/RepSettings'
import DailyInputForm from '@/components/DailyInputForm'

export default function Home() {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [activeTab, setActiveTab] = useState<'form' | 'sheet' | 'analysis' | 'settings'>('form')
  const [loading, setLoading] = useState(true)

  const months = getMonthList(24)

  useEffect(() => { loadReps() }, [])

  async function loadReps() {
    const { data } = await supabase.from('sales_reps').select('*').order('display_order')
    if (data) { setReps(data); if (data.length > 0) setSelectedRep(data[0]) }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-slate-400 text-sm font-medium">読み込み中...</div>
      </div>
    )
  }

  const tabs = [
    { id: 'form',     label: '入力' },
    { id: 'sheet',    label: '表' },
    { id: 'analysis', label: '分析' },
    { id: 'settings', label: '設定' },
  ] as const

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top navigation */}
      <div className="top-nav">
        {/* Row 1: title + selectors */}
        <div className="flex items-center gap-2 mb-2">
          <span className="top-nav-title">origin-dx 数値管理</span>
          <div className="flex-1" />
          {/* Month */}
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-slate-700 text-white text-xs font-semibold rounded-lg px-2 py-1.5 border-none outline-none cursor-pointer"
          >
            {months.map(m => (
              <option key={m} value={m}>{formatYearMonth(m)}</option>
            ))}
          </select>
          {/* Rep */}
          <select
            value={selectedRep?.id ?? ''}
            onChange={e => {
              const rep = reps.find(r => r.id === e.target.value)
              setSelectedRep(rep || null)
            }}
            className="bg-slate-700 text-white text-xs font-semibold rounded-lg px-2 py-1.5 border-none outline-none cursor-pointer max-w-[110px]"
          >
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {/* Row 2: tabs */}
        <div className="tab-bar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn ${activeTab === tab.id ? 'tab-btn-active' : 'tab-btn-inactive'}`}
            >
              {tab.id === 'form' ? '✏️ ' + tab.label :
               tab.id === 'sheet' ? '📋 ' + tab.label :
               tab.id === 'analysis' ? '📈 ' + tab.label : '⚙️ ' + tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={activeTab === 'form' ? 'p-3 pb-28' : activeTab === 'sheet' ? 'p-2' : 'p-3'}>
        {activeTab === 'form' && selectedRep && (
          <DailyInputForm repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeTab === 'sheet' && selectedRep && (
          <SheetView repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeTab === 'analysis' && selectedRep && (
          <AnalysisView repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeTab === 'settings' && (
          <RepSettings reps={reps} onUpdate={loadReps} />
        )}
      </div>
    </div>
  )
}
