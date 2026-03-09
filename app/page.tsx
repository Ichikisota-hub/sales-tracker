'use client'

import { useEffect, useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'
import { getMonthList, formatYearMonth } from '@/lib/dateUtils'
import SheetView from '@/components/SheetView'
import AnalysisView from '@/components/AnalysisView'
import RepSettings from '@/components/RepSettings'

export default function Home() {
  const [reps, setReps] = useState<SalesRep[]>([])
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [activeTab, setActiveTab] = useState<'sheet' | 'analysis' | 'settings'>('sheet')
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-300 px-3 py-2 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
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
          className="border border-gray-300 rounded px-2 py-1 text-xs font-medium bg-white max-w-[140px]"
        >
          {reps.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>

        {/* Tabs */}
        <div className="flex gap-1 ml-2">
          {(['sheet', 'analysis', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab === 'sheet' ? '日次入力' : tab === 'analysis' ? '分析' : '設定'}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-gray-400">
          {selectedRep?.name} / {formatYearMonth(selectedMonth)}
        </div>
      </div>

      {/* Content */}
      <div className="p-2">
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
