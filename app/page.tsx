'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { getMonthList, formatYearMonth, localYearMonth } from '@/lib/dateUtils'
import SheetView from '@/components/SheetView'
import AnalysisView from '@/components/AnalysisView'
import RepSettings from '@/components/RepSettings'
import DailyInputForm from '@/components/DailyInputForm'
import OverallView from '@/components/OverallView'
import ScheduleSubmitForm from '@/components/ScheduleSubmitForm'
import ShiftCalendarView from '@/components/ShiftCalendarView'
import AreaStatsView from '@/components/AreaStatsView'
import StatusView from '@/components/StatusView'
import ContractListView from '@/components/ContractListView'
import ContractAddForm from '@/components/ContractAddForm'

function getNextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type MainTab = 'form' | 'status' | 'analysis' | 'overall'
type SubTab = 'contracts' | 'shift_submit' | 'shift' | 'area' | 'sheet' | 'settings'

export default function Home() {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(localYearMonth())
  const [scheduleMonth, setScheduleMonth] = useState<string>(getNextMonth(localYearMonth()))
  const [activeTab, setActiveTab] = useState<MainTab>('form')
  const [subMenuOpen, setSubMenuOpen] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<SubTab | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContractAdd, setShowContractAdd] = useState(false)
  const subMenuRef = useRef<HTMLDivElement>(null)

  const months = getMonthList(24)
  const scheduleMonthOptions = [localYearMonth(), getNextMonth(localYearMonth())]

  useEffect(() => { loadReps() }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (subMenuRef.current && !subMenuRef.current.contains(e.target as Node)) {
        setSubMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadReps() {
    const { data } = await supabase.from('sales_reps').select('*').order('display_order')
    if (data) { setReps(data); if (data.length > 0) setSelectedRep(data[0]) }
    setLoading(false)
  }

  function openSubTab(tab: SubTab) {
    setActiveSubTab(tab)
    setActiveTab('form')
    setSubMenuOpen(false)
  }

  function openMainTab(tab: MainTab) {
    setActiveTab(tab)
    setActiveSubTab(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-slate-400 text-sm font-medium">読み込み中...</div>
      </div>
    )
  }

  const mainTabs = [
    { id: 'form'     as MainTab, label: '入力',    icon: '✏️' },
    { id: 'status'   as MainTab, label: '現状整理', icon: '📋' },
    { id: 'analysis' as MainTab, label: '分析',    icon: '📈' },
    { id: 'overall'  as MainTab, label: '全体',    icon: '🏆' },
  ]

  const subTabs = [
    { id: 'contracts'    as SubTab, label: '契約宅',    icon: '🏠' },
    { id: 'shift_submit' as SubTab, label: 'シフト提出', icon: '📅' },
    { id: 'shift'        as SubTab, label: 'シフト確認', icon: '🗓️' },
    { id: 'area'         as SubTab, label: 'エリア',    icon: '📍' },
    { id: 'sheet'        as SubTab, label: '表',        icon: '📊' },
    { id: 'settings'     as SubTab, label: '設定',      icon: '⚙️' },
  ]

  const currentTab = activeSubTab ?? activeTab
  const isShiftSubmitTab = currentTab === 'shift_submit'
  const needsRep = ['form', 'status', 'shift_submit', 'sheet', 'analysis'].includes(currentTab)
  const padContent = ['form', 'shift_submit'].includes(currentTab)

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="top-nav">
        <div className="flex items-center gap-2 mb-2">
          <span className="top-nav-title">origin-dx 数値管理</span>

          {isShiftSubmitTab ? (
            <div className="flex gap-1">
              {scheduleMonthOptions.map(m => (
                <button key={m} onClick={() => setScheduleMonth(m)}
                  className={`text-xs font-bold px-2 py-1.5 rounded-lg transition-all ${
                    scheduleMonth === m ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}>
                  {m === localYearMonth() ? `今月` : `翌月`}
                  <span className="text-[10px] opacity-70 ml-0.5">({formatYearMonth(m)})</span>
                </button>
              ))}
            </div>
          ) : currentTab !== 'contracts' ? (
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="bg-slate-700 text-white text-xs font-semibold rounded-lg px-2 py-1.5 border-none outline-none cursor-pointer">
              {months.map(m => <option key={m} value={m}>{formatYearMonth(m)}</option>)}
            </select>
          ) : null}

          {needsRep && (
            <select value={selectedRep?.id ?? ''} onChange={e => setSelectedRep(reps.find(r => r.id === e.target.value) || null)}
              className="bg-slate-700 text-white text-xs font-semibold rounded-lg px-2 py-1.5 border-none outline-none cursor-pointer max-w-[110px]">
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="tab-bar flex-1">
            {mainTabs.map(tab => (
              <button key={tab.id} onClick={() => openMainTab(tab.id)}
                className={`tab-btn ${activeTab === tab.id && !activeSubTab ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="relative" ref={subMenuRef}>
            <button
              onClick={() => setSubMenuOpen(v => !v)}
              className={`tab-btn flex-shrink-0 px-3 font-black text-base transition-all ${
                activeSubTab ? 'tab-btn-active' : subMenuOpen ? 'bg-slate-600 text-white rounded-lg' : 'tab-btn-inactive'
              }`}
              style={{minWidth:36}}>
              ≡
            </button>

            {subMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 min-w-[150px]">
                {subTabs.map(tab => (
                  <button key={tab.id} onClick={() => openSubTab(tab.id)}
                    className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-left transition-colors hover:bg-slate-50 ${
                      activeSubTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                    }`}>
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {activeSubTab === tab.id && <span className="ml-auto text-blue-500">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={padContent ? 'p-3 pb-28' : currentTab === 'sheet' ? 'p-2' : 'p-3'}>
        {activeSubTab === null && activeTab === 'form' && selectedRep && (
          <DailyInputForm repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeSubTab === null && activeTab === 'status' && selectedRep && (
          <StatusView repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeSubTab === null && activeTab === 'analysis' && selectedRep && (
          <AnalysisView repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeSubTab === null && activeTab === 'overall' && (
          <OverallView yearMonth={selectedMonth} />
        )}
        {activeSubTab === 'contracts' && (
          <ContractListView
            reps={reps}
            selectedRepId={selectedRep?.id || null}
            onAdd={() => setShowContractAdd(true)}
          />
        )}
        {activeSubTab === 'shift_submit' && selectedRep && (
          <ScheduleSubmitForm repId={selectedRep.id} repName={selectedRep.name} yearMonth={scheduleMonth} />
        )}
        {activeSubTab === 'shift' && (
          <ShiftCalendarView yearMonth={scheduleMonth} />
        )}
        {activeSubTab === 'area' && (
          <AreaStatsView yearMonth={selectedMonth} />
        )}
        {activeSubTab === 'sheet' && selectedRep && (
          <SheetView repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeSubTab === 'settings' && (
          <RepSettings reps={reps} onUpdate={loadReps} />
        )}
      </div>

      {/* 契約宅追加モーダル */}
      {showContractAdd && (
        <ContractAddForm
          reps={reps}
          defaultRepId={selectedRep?.id}
          onSaved={() => {
            setShowContractAdd(false)
            // ContractListViewをリフレッシュするためにキーを更新
            openSubTab('contracts')
          }}
          onCancel={() => setShowContractAdd(false)}
        />
      )}
    </div>
  )
}
