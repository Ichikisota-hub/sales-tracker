'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  PenLine, LayoutDashboard, TrendingUp, Users,
  Home as HomeIcon, BarChart2, CalendarCheck, Calendar, CalendarDays,
  MapPin, Table, FileSpreadsheet, BarChart3,
  FileText, CheckSquare, Settings, Building2, LogOut,
  ChevronDown, Menu, Shield
} from 'lucide-react'
import { supabase, SalesRep, Team } from '@/lib/supabase'
import { getMonthList, formatYearMonth, localYearMonth } from '@/lib/dateUtils'
import { useOrganization } from '@/contexts/OrganizationContext'
import { useAuth } from '@/contexts/AuthContext'
import TrialBanner from '@/components/billing/TrialBanner'

// 担当者未リンク時の自己紐付け画面
function RepLinkScreen({ reps, signOut }: { reps: SalesRep[]; signOut: () => void }) {
  const [selected, setSelected] = useState('')
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')

  async function handleLink() {
    if (!selected) return
    setLinking(true)
    setError('')
    try {
      const res = await fetch('/api/auth/link-rep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: selected }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || '紐付けに失敗しました'); setLinking(false); return }
      // 成功: ページリロードで membership を再取得
      window.location.href = '/'
    } catch {
      setError('エラーが発生しました')
      setLinking(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-5 px-6"
      style={{ background: 'linear-gradient(160deg, #0c1220 0%, #0f172a 100%)' }}>
      <img src="/logo.png" alt="logo" className="h-12 w-auto opacity-80" />
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <p className="text-white font-bold text-sm text-center">あなたの名前を選択してください</p>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
          style={{ background: 'rgba(255,255,255,0.09)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <option value="" style={{ background: '#1e293b' }}>— 選択してください —</option>
          {reps.map(r => (
            <option key={r.id} value={r.name} style={{ background: '#1e293b' }}>{r.name}</option>
          ))}
        </select>
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        <button
          onClick={handleLink}
          disabled={!selected || linking}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#6366f1,#2563eb)', color: 'white' }}
        >
          {linking ? '設定中...' : '確定する'}
        </button>
      </div>
      <button onClick={signOut} className="text-slate-500 text-xs hover:text-slate-300 transition-colors underline">
        ログアウト
      </button>
    </div>
  )
}

// タブが開かれた時だけ読み込む（コード分割でバンドルサイズ削減）
const DailyInputForm    = dynamic(() => import('@/components/DailyInputForm'))
const StatusView        = dynamic(() => import('@/components/StatusView'))
const AnalysisView      = dynamic(() => import('@/components/AnalysisView'))
const OverallView       = dynamic(() => import('@/components/OverallView'))
const SheetView         = dynamic(() => import('@/components/SheetView'))
const ScheduleSubmitForm  = dynamic(() => import('@/components/ScheduleSubmitForm'))
const ShiftMyCalendar     = dynamic(() => import('@/components/ShiftMyCalendar'))
const ShiftCalendarView   = dynamic(() => import('@/components/ShiftCalendarView'))
const DailyShiftView      = dynamic(() => import('@/components/DailyShiftView'))
const AreaStatsView       = dynamic(() => import('@/components/AreaStatsView'))
const TeamSheetView       = dynamic(() => import('@/components/TeamSheetView'))
const TeamStatsView       = dynamic(() => import('@/components/TeamStatsView'))
const WeeklyKPIView       = dynamic(() => import('@/components/WeeklyKPIView'))
const DailyReportListView = dynamic(() => import('@/components/DailyReportListView'))
const SubmissionCheckView = dynamic(() => import('@/components/SubmissionCheckView'))
const RepSettings         = dynamic(() => import('@/components/RepSettings'))
const ContractListView    = dynamic(() => import('@/components/ContractListView'))
const ContractStatsView   = dynamic(() => import('@/components/ContractStatsView'))
const ContractAddForm     = dynamic(() => import('@/components/ContractAddForm'))
const ContractImportModal = dynamic(() => import('@/components/ContractImportModal'))

function getNextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type MainTab = 'form' | 'status' | 'analysis' | 'overall'
type SubTab = 'contracts' | 'shift_submit' | 'shift' | 'daily_shift' | 'area' | 'sheet' | 'settings' | 'daily_report' | 'team_sheet' | 'stats_sheet' | 'submission_check' | 'contract_stats' | 'weekly_kpi'

const ORIGIN_ORG_ID = '0524dcfa-685f-4635-971b-39c7899da7cd'

export default function Home() {
  const { signOut, user } = useAuth()
  const [superadminEmails, setSuperadminEmails] = useState<string[]>(['souta51203@gmail.com', 'origin.compamy001@gmail.com'])
  const isSuperAdmin = !!user?.email && superadminEmails.includes(user.email)

  useEffect(() => {
    fetch('/api/superadmin/admins', { headers: { 'x-superadmin-key': 'Origin0201' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.emails) setSuperadminEmails(d.emails) })
      .catch(() => {})
  }, [])
  const { membership, isManager, role, loading: orgLoading, organizationId } = useOrganization()
  const [reps, setReps] = useState<SalesRep[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(null)
  const activeOrgIds = [ORIGIN_ORG_ID]
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

  // organizationId が確定したタイミングで担当者一覧を読み込む（初回 + 変化時）
  useEffect(() => {
    if (!orgLoading) loadReps()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, orgLoading])

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
    // org フィルタなし — organization_id=NULL の既存データも含めて全件取得（Allow all RLS）
    const [{ data }, { data: teamData }] = await Promise.all([
      supabase.from('sales_reps').select('*').eq('is_active', true).order('display_order'),
      supabase.from('teams').select('*').order('display_order'),
    ])
    if (data) setReps(data)
    setTeams(teamData || [])
    setLoading(false)
  }

  // rep自動選択: membership と reps が揃ったタイミングで実行
  useEffect(() => {
    if (reps.length === 0) return

    if (!isManager) {
      // member: 紐付き担当者のみ（sales_rep_id がなければ null）
      const linked = membership?.sales_rep_id
        ? reps.find(r => r.id === membership.sales_rep_id) ?? null
        : null
      setSelectedRep(linked)
    } else {
      // admin / manager: sales_rep_id → localStorage → 先頭の順でデフォルト選択
      const linkedId = membership?.sales_rep_id
      const savedId = localStorage.getItem('selectedRepId')
      const preferred = reps.find(r => r.id === (linkedId || savedId)) ?? reps[0] ?? null
      setSelectedRep(prev => prev ?? preferred)
    }
  }, [reps, membership, isManager])

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

  if (loading || orgLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4"
        style={{ background: 'linear-gradient(160deg, #0c1220 0%, #0f172a 100%)' }}>
        <img src="/logo.png" alt="logo" className="h-12 w-auto opacity-80 mb-2" />
        <div className="w-7 h-7 border-2 border-indigo-800 border-t-indigo-400 rounded-full animate-spin" />
        <div className="text-slate-500 text-xs font-semibold tracking-widest uppercase">Loading...</div>
      </div>
    )
  }

  // member で担当者が紐付いていない場合 — 名前選択で自己リンク
  if (!isManager && role !== null && !selectedRep && reps.length > 0) {
    return <RepLinkScreen reps={reps} signOut={signOut} />
  }

  // 設定タブのみ admin/manager 限定。それ以外は全ロール共通
  const mainTabs = [
    { id: 'form'     as MainTab, label: '入力',    Icon: PenLine },
    { id: 'status'   as MainTab, label: '現状',    Icon: LayoutDashboard },
    { id: 'analysis' as MainTab, label: '分析',    Icon: TrendingUp },
    { id: 'overall'  as MainTab, label: '全体',    Icon: Users },
  ]

  const subTabs = [
    { id: 'contracts'        as SubTab, label: '契約宅',    Icon: HomeIcon },
    { id: 'contract_stats'   as SubTab, label: '契約統計',  Icon: BarChart2 },
    ...(organizationId === ORIGIN_ORG_ID ? [{ id: 'shift_submit' as SubTab, label: 'シフト提出', Icon: CalendarCheck }] : []),
    ...(organizationId === ORIGIN_ORG_ID ? [{ id: 'shift' as SubTab, label: 'シフト確認', Icon: Calendar }] : []),
    ...(organizationId === ORIGIN_ORG_ID ? [{ id: 'daily_shift' as SubTab, label: '日別稼働', Icon: CalendarDays }] : []),
    { id: 'area'             as SubTab, label: 'エリア',     Icon: MapPin },
    { id: 'sheet'            as SubTab, label: '表',         Icon: Table },
    { id: 'team_sheet'       as SubTab, label: 'チーム表',   Icon: FileSpreadsheet },
    { id: 'stats_sheet'      as SubTab, label: '数値表',     Icon: BarChart3 },
    { id: 'weekly_kpi'       as SubTab, label: '週KPI',      Icon: TrendingUp },
    { id: 'daily_report'     as SubTab, label: '日報',       Icon: FileText },
    ...(isManager ? [{ id: 'submission_check' as SubTab, label: '提出確認', Icon: CheckSquare }] : []),
    ...(isManager ? [{ id: 'settings' as SubTab, label: '設定', Icon: Settings }] : []),
  ]

  const currentTab = activeSubTab ?? activeTab
  const isShiftSubmitTab = currentTab === 'shift_submit' || currentTab === 'shift' || currentTab === 'daily_shift'
  const needsRep = ['form', 'status', 'shift_submit', 'sheet', 'analysis'].includes(currentTab)
  const padContent = ['form', 'shift_submit'].includes(currentTab)

  return (
    <div className="min-h-screen" style={{ background: '#eef1f6' }}>
      <TrialBanner />
      <div className="top-nav">
        {/* Row 1: Logo + Selectors */}
        <div className="flex items-center gap-2 mb-2.5">
          <img src="/logo.png" alt="ORIGIN SALES REPORTING" className="h-11 w-auto flex-shrink-0" />

          {isShiftSubmitTab ? (
            <div className="flex gap-1.5">
              {scheduleMonthOptions.map(m => (
                <button key={m} onClick={() => setScheduleMonth(m)}
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all ${
                    scheduleMonth === m
                      ? 'text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                  style={scheduleMonth === m ? { background: 'linear-gradient(135deg,#6366f1,#2563eb)', boxShadow: '0 4px 12px rgba(99,102,241,.4)' } : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.08)' }}>
                  {m === localYearMonth() ? '今月' : '翌月'}
                  <span className="text-[10px] opacity-60 ml-0.5">({formatYearMonth(m)})</span>
                </button>
              ))}
            </div>
          ) : currentTab !== 'contracts' ? (
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="text-slate-200 text-xs font-semibold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.1)' }}>
              {months.map(m => <option key={m} value={m} className="bg-slate-800">{formatYearMonth(m)}</option>)}
            </select>
          ) : null}

          {needsRep && (
            isManager ? (
              <select value={selectedRep?.id ?? ''} onChange={e => {
                const rep = reps.find(r => r.id === e.target.value) || null
                setSelectedRep(rep)
                if (rep) localStorage.setItem('selectedRepId', rep.id)
              }}
                className="text-slate-200 text-xs font-semibold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer max-w-[110px]"
                style={{ background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.1)' }}>
                {teams.length > 0 ? (
                  <>
                    {teams.map(team => {
                      const teamReps = reps.filter(r => r.team_id === team.id)
                      if (teamReps.length === 0) return null
                      return (
                        <optgroup key={team.id} label={team.name}>
                          {teamReps.map(r => <option key={r.id} value={r.id} className="bg-slate-800">{r.name}</option>)}
                        </optgroup>
                      )
                    })}
                    {reps.filter(r => !r.team_id).length > 0 && (
                      <optgroup label="未所属">
                        {reps.filter(r => !r.team_id).map(r => <option key={r.id} value={r.id} className="bg-slate-800">{r.name}</option>)}
                      </optgroup>
                    )}
                  </>
                ) : (
                  reps.map(r => <option key={r.id} value={r.id} className="bg-slate-800">{r.name}</option>)
                )}
              </select>
            ) : selectedRep ? (
              <span className="text-slate-200 text-xs font-semibold rounded-xl px-2.5 py-1.5"
                style={{ background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.1)' }}>
                {selectedRep.name}
              </span>
            ) : null
          )}
        </div>

        {/* Row 2: Main tabs + Sub menu */}
        <div className="flex items-center gap-1.5">
          <div className="tab-bar flex-1">
            {mainTabs.map(tab => {
              const active = activeTab === tab.id && !activeSubTab
              return (
                <button key={tab.id} onClick={() => openMainTab(tab.id)}
                  className={`tab-btn ${active ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
                  <tab.Icon size={14} strokeWidth={2.2} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div className="relative" ref={subMenuRef}>
            <button
              onClick={() => setSubMenuOpen(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold text-xs transition-all border ${
                activeSubTab
                  ? 'text-white border-transparent'
                  : subMenuOpen
                  ? 'text-white border-transparent'
                  : 'text-slate-400 border-transparent'
              }`}
              style={activeSubTab || subMenuOpen
                ? { background: 'linear-gradient(135deg,#6366f1,#2563eb)', boxShadow: '0 2px 12px rgba(99,102,241,.45)' }
                : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.08)' }
              }>
              {activeSubTab ? (
                <>
                  {(() => { const t = subTabs.find(t => t.id === activeSubTab); return t ? <t.Icon size={13} /> : null })()}
                  <span className="text-[11px] max-w-[48px] truncate">{subTabs.find(t => t.id === activeSubTab)?.label}</span>
                  <ChevronDown size={10} className="opacity-70" />
                </>
              ) : (
                <Menu size={16} />
              )}
            </button>

            {subMenuOpen && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl overflow-hidden z-50 w-[280px]"
                style={{ boxShadow: '0 16px 48px rgba(0,0,0,.18), 0 4px 16px rgba(0,0,0,.10)', border: '1px solid rgba(226,232,240,0.8)' }}>
                <div className="px-3 pt-3 pb-1">
                  <div className="text-[10px] font-700 text-slate-400 tracking-widest uppercase mb-2 px-1">メニュー</div>
                  <div className="grid grid-cols-2 gap-1">
                    {subTabs.map(tab => (
                      <button key={tab.id} onClick={() => openSubTab(tab.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all text-left ${
                          activeSubTab === tab.id
                            ? 'text-indigo-700 font-bold'
                            : 'text-slate-600 font-semibold hover:bg-slate-50'
                        }`}
                        style={activeSubTab === tab.id ? { background: 'linear-gradient(135deg,#eef2ff,#eff6ff)' } : {}}>
                        <tab.Icon size={15} strokeWidth={2} className={activeSubTab === tab.id ? 'text-indigo-500' : 'text-slate-400'} />
                        <span className="text-[12.5px]">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-slate-100 px-3 py-2 mt-1">
                  <Link href="/admin" onClick={() => setSubMenuOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-left rounded-xl transition-colors hover:bg-slate-50 text-slate-500">
                    <Building2 size={15} className="text-slate-400" />
                    <span>組織管理</span>
                  </Link>
                  {isSuperAdmin && (
                    <Link href="/superadmin" onClick={() => setSubMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-left rounded-xl transition-colors hover:bg-indigo-50 text-indigo-500">
                      <Shield size={15} className="text-indigo-400" />
                      <span>システム管理</span>
                    </Link>
                  )}
                  <button onClick={() => { setSubMenuOpen(false); signOut() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-left rounded-xl transition-colors hover:bg-red-50 text-slate-500 hover:text-red-500">
                    <LogOut size={15} className="text-slate-400" />
                    <span>ログアウト</span>
                  </button>
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
          <OverallView yearMonth={selectedMonth} teams={teams} orgIds={activeOrgIds} />
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
              orgIds={activeOrgIds}
            />
          </>
        )}
        {activeSubTab === 'contract_stats' && (
          <ContractStatsView orgIds={activeOrgIds} />
        )}
        {activeSubTab === 'shift_submit' && selectedRep && (
          <ShiftMyCalendar repId={selectedRep.id} repName={selectedRep.name} initialYearMonth={scheduleMonth} />
        )}
        {activeSubTab === 'shift' && (
          <ShiftCalendarView yearMonth={scheduleMonth} teams={teams} orgIds={activeOrgIds} />
        )}
        {activeSubTab === 'daily_shift' && (
          <DailyShiftView yearMonth={scheduleMonth} teams={teams} orgIds={activeOrgIds} />
        )}
        {activeSubTab === 'area' && (
          <AreaStatsView yearMonth={selectedMonth} />
        )}
        {activeSubTab === 'sheet' && selectedRep && (
          <SheetView repId={selectedRep.id} repName={selectedRep.name} yearMonth={selectedMonth} />
        )}
        {activeSubTab === 'team_sheet' && (
          <TeamSheetView yearMonth={selectedMonth} teams={teams} orgIds={activeOrgIds} />
        )}
        {activeSubTab === 'stats_sheet' && (
          <TeamStatsView yearMonth={selectedMonth} teams={teams} orgIds={activeOrgIds} />
        )}
        {activeSubTab === 'weekly_kpi' && (
          <WeeklyKPIView yearMonth={selectedMonth} teams={teams} orgIds={activeOrgIds} />
        )}
        {activeSubTab === 'daily_report' && (
          <DailyReportListView teams={teams} orgIds={activeOrgIds} />
        )}
        {activeSubTab === 'submission_check' && (
          <SubmissionCheckView yearMonth={selectedMonth} teams={teams} orgIds={activeOrgIds} />
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
