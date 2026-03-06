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

  useEffect(() => {
    loadReps()
  }, [])

  async function loadReps() {
    const { data } = await supabase
      .from('sales_reps')
      .select('*')
      .order('display_order')
    if (data) {
      setReps(data)
      if (data.length > 0) setSelectedRep(data[0])
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500 text-sm">読み込み中...</div>
      </div>
    )
  }

  const tabs = [
    { id: 'form',     label: '📝 かんたん入力' },
    { id: 'sheet',    label: '📊 表形式' },
    { id: 'analysis', label: '📈 分析' },
    { id: 'settings', label: '⚙️ 設定' },
  ] as const

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-300 px-3 py-2 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h1 className="font-bold text-sm text-gray-800 whitespace-nowrap">営業活動管理</h1>

          {/* Month selector */}
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs font-medium bg-white"
          >
            {months.map(m => (
              <option key={m} value={m}>{formatYearMonth(m)}</option>
            ))}
          </select>

          {/* Rep selector */}
          <select
            value={selectedRep?.id ?? ''}
            onChange={e => {
              const rep = reps.find(r => r.id === e.target.value)
              setSelectedRep(rep || null)
            }}
            className="border border-gray-300 rounded px-2 py-1 text-xs font-medium bg-white max-w-[160px]"
          >
            {reps.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {activeTab === 'form' && selectedRep && (
          <DailyInputForm
            repId={selectedRep.id}
            repName={selectedRep.name}
            yearMonth={selectedMonth}
          />
        )}
        {activeTab === 'sheet' && selectedRep && (
          <SheetView
            repId={selectedRep.id}
            repName={selectedRep.name}
            yearMonth={selectedMonth}
          />
        )}
        {activeTab === 'analysis' && selectedRep && (
          <AnalysisView
            repId={selectedRep.id}
            repName={selectedRep.name}
            yearMonth={selectedMonth}
          />
        )}
        {activeTab === 'settings' && (
          <RepSettings reps={reps} onUpdate={loadReps} />
        )}
      </div>
    </div>
  )
}
