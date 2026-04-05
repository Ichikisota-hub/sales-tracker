'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase, SalesRep, Team } from '@/lib/supabase'
import { getMonthList, formatYearMonth, localYearMonth } from '@/lib/dateUtils'
import { useOrganization } from '@/contexts/OrganizationContext'
import { useAuth } from '@/contexts/AuthContext'
import TrialBanner from '@/components/billing/TrialBanner'
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
import ContractImportModal from '@/components/ContractImportModal'
import DailyShiftView from '@/components/DailyShiftView'
import DailyReportListView from '@/components/DailyReportListView'
import TeamSheetView from '@/components/TeamSheetView'
import TeamStatsView from '@/components/TeamStatsView'

function getNextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type MainTab = 'form' | 'status' | 'analysis' | 'overall'
type SubTab = 'contracts' | 'shift_submit' | 'shift' | 'daily_shift' | 'area' | 'sheet' | 'settings' | 'daily_report' | 'team_sheet' | 'stats_sheet'

export default function Home() {
  const { signOut } = useAuth()
  const [reps, setReps] = useState<SalesRep[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(localYearMonth())
  const [scheduleMonth, setScheduleMonth] = useState<string>(getNextMonth(localYearMonth()))
  const [activeTab, setActiveTab] = useState<MainTab>('form')
  const [subMenuOpen, setSubMenuOpen] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<SubTab | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContractAdd, setShowContractAdd] = useState(false)
  const [showContractImport, setShowContractImport] = useState(false)
  const [contractRefreshKey, setContractRefreshKey] = useState(0)
  const [settingsUnlocked, setSettingsUnlocked] = useState(false)
  const [settingsPassword, setSettingsPassword] = useState('')
  const [settingsPasswordError, setSettingsPasswordError] = useState(false)
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
    const [{ data }, { data: teamData }] = await Promise.all([
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
      supabase.from('teams').select('*').order('display_order'),
    ])
    if (data) {
      setReps(data)
      const savedId = localStorage.getItem('selectedRepId')
      const saved = savedId ? data.find(r => r.id === savedId) : null
      setSelectedRep((prev: SalesRep | null) => prev ?? saved ?? (data.length > 0 ? data[0] : null))
    }
    setTeams(teamData || [])
    setLoading(false)
  }

  function openSubTab(tab: SubTab) {
    setActiveSubTab(tab)
    setActiveTab('form')
    setSubMenuOpen(false)
    if (tab !== 'settings') {
      setSettingsUnlocked(false)
      setSettingsPassword('')
      setSettingsPasswordError(false)
    }
  }

  function openMainTab(tab: MainTab) {
    setActiveTab(tab)
    setActiveSubTab(null)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 gap-3">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
        <div className="text-slate-500 text-sm font-medium">読み込み中...</div>
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
    { id: 'daily_shift'  as SubTab, label: '日別稼働',   icon: '📆' },
    { id: 'area'         as SubTab, label: 'エリア',    icon: '📍' },
    { id: 'sheet'        as SubTab, label: '表',        icon: '📊' },
    { id: 'team_sheet'   as SubTab, label: 'チーム表',   icon: '📋' },
    { id: 'stats_sheet'  as SubTab, label: '数値表',     icon: '📊' },
    { id: 'daily_report' as SubTab, label: '日報',       icon: '📝' },
    { id: 'settings'     as SubTab, label: '設定',      icon: '⚙️' },
  ]

  const adminMenuItems = [
    { label: 'ログアウト', icon: '🚪', action: signOut },
  ]

  const currentTab = activeSubTab ?? activeTab
  const isShiftSubmitTab = currentTab === 'shift_submit' || currentTab === 'shift' || currentTab === 'daily_shift'
  const needsRep = ['form', 'status', 'shift_submit', 'sheet', 'analysis'].includes(currentTab)
  const padContent = ['form', 'shift_submit'].includes(currentTab)

  return (
    <div className="min-h-screen bg-slate-100">
      <TrialBanner />
      <div className="top-nav">
        <div className="flex items-center gap-2 mb-2">
          <img src="/logo.png" alt="ORIGIN SALES REPORTING" className="h-14 w-auto" />

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
              className="bg-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-2.5 py-1.5 border border-slate-700 outline-none cursor-pointer">
              {months.map(m => <option key={m} value={m}>{formatYearMonth(m)}</option>)}
            </select>
          ) : null}

          {needsRep && (
            <select value={selectedRep?.id ?? ''} onChange={e => {
              const rep = reps.find(r => r.id === e.target.value) || null
              setSelectedRep(rep)
              if (rep) localStorage.setItem('selectedRepId', rep.id)
            }}
              className="bg-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-2.5 py-1.5 border border-slate-700 outline-none cursor-pointer max-w-[120px]">
              {teams.length > 0 ? (
                <>
                  {teams.map(team => {
                    const teamReps = reps.filter(r => r.team_id === team.id)
                    if (teamReps.length === 0) return null
                    return (
                      <optgroup key={team.id} label={team.name}>
                        {teamReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </optgroup>
                    )
                  })}
                  {reps.filter(r => !r.team_id).length > 0 && (
                    <optgroup label="未所属">
                      {reps.filter(r => !r.team_id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </optgroup>
                  )}
                </>
              ) : (
                reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)
              )}
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
              className={`tab-btn flex-shrink-0 flex items-center gap-1 px-2 transition-all ${
                activeSubTab ? 'tab-btn-active' : subMenuOpen ? 'bg-slate-600 text-white rounded-lg' : 'tab-btn-inactive'
              }`}
              style={{minWidth: activeSubTab ? 'auto' : 34}}>
              {activeSubTab ? (
                <>
                  <span>{subTabs.find(t => t.id === activeSubTab)?.icon}</span>
                  <span className="text-[11px]">{subTabs.find(t => t.id === activeSubTab)?.label}</span>
                  <span className="text-[10px] opacity-70">▾</span>
                </>
              ) : '≡'}
            </button>

            {subMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 w-[272px]">
                <div className="p-2 grid grid-cols-2 gap-1">
                  {subTabs.map(tab => (
                    <button key={tab.id} onClick={() => openSubTab(tab.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-left rounded-xl transition-colors ${
                        activeSubTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}>
                      <span className="text-base">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-slate-100 p-2">
                  <Link href="/admin" onClick={() => setSubMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-left rounded-xl transition-colors hover:bg-slate-50 text-slate-500">
                    <span>🏢</span>
                    <span>組織管理</span>
                  </Link>
                  {adminMenuItems.map((item, i) => (
                    <button key={i} onClick={() => { setSubMenuOpen(false); item.action?.() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-left rounded-xl transition-colors hover:bg-slate-50 text-slate-500">
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
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
          <OverallView yearMonth={selectedMonth} teams={teams} />
        )}
        {activeSubTab === 'contracts' && (
          <>
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setShowContractImport(true)}
                className="text-xs bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-xl hover:bg-slate-600 transition-colors"
              >
                📥 スプレッドシートから取り込み
              </button>
            </div>
            <ContractListView
              key={contractRefreshKey}
              reps={reps}
              selectedRepId={selectedRep?.id || null}
              onAdd={() => setShowContractAdd(true)}
            />
          </>
        )}
        {activeSubTab === 'shift_submit' && selectedRep && (
          <ScheduleSubmitForm repId={selectedRep.id} repName={selectedRep.name} yearMonth={scheduleMonth} />
        )}
        {activeSubTab === 'shift' && (
          <ShiftCalendarView yearMonth={scheduleMonth} teams={teams} />
        )}
        {activeSubTab === 'daily_shift' && (
          <DailyShiftView yearMonth={scheduleMonth} teams={teams} />
        )}
        {activeSubTab === 'area' && (
          <AreaStatsView yearMonth={selectedMonth} />
        )}
        {activeSubTab === 'sheet' && selectedRep && (
          <SheetView repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeSubTab === 'team_sheet' && (
          <TeamSheetView yearMonth={selectedMonth} teams={teams} />
        )}
        {activeSubTab === 'stats_sheet' && (
          <TeamStatsView yearMonth={selectedMonth} teams={teams} />
        )}
        {activeSubTab === 'daily_report' && (
          <DailyReportListView teams={teams} />
        )}
        {activeSubTab === 'settings' && (
          settingsUnlocked ? (
            <RepSettings reps={reps} onUpdate={loadReps} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="text-slate-500 text-sm font-bold">設定画面はパスワードが必要です</div>
              <form onSubmit={e => {
                e.preventDefault()
                if (settingsPassword === 'Origin0201') {
                  setSettingsUnlocked(true)
                  setSettingsPasswordError(false)
                } else {
                  setSettingsPasswordError(true)
                  setSettingsPassword('')
                }
              }} className="flex flex-col items-center gap-3">
                <input
                  type="password"
                  value={settingsPassword}
                  onChange={e => { setSettingsPassword(e.target.value); setSettingsPasswordError(false) }}
                  placeholder="パスワードを入力"
                  className="border border-slate-300 rounded-lg px-4 py-2 text-sm outline-none focus:border-blue-400 w-52"
                  autoFocus
                />
                {settingsPasswordError && (
                  <div className="text-red-500 text-xs font-bold">パスワードが違います</div>
                )}
                <button type="submit"
                  className="bg-blue-600 text-white text-sm font-bold px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                  入力
                </button>
              </form>
            </div>
          )
        )}
      </div>

      {/* 契約宅インポートモーダル */}
      {showContractImport && (
        <ContractImportModal
          onClose={() => setShowContractImport(false)}
          onImported={() => {
            setShowContractImport(false)
            setContractRefreshKey(k => k + 1)
          }}
        />
      )}

      {/* 契約宅追加モーダル */}
      {showContractAdd && (
        <ContractAddForm
          reps={reps}
          defaultRepId={selectedRep?.id}
          onSaved={() => {
            setShowContractAdd(false)
            setContractRefreshKey(k => k + 1)
          }}
          onCancel={() => setShowContractAdd(false)}
        />
      )}
    </div>
  )
}
