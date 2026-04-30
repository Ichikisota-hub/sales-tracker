'use client'

import { memo, useEffect, useState } from 'react'

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type Props = {
  startedAt: Date
  breakMs: number
  paused: boolean
}

// タイマー表示を独立コンポーネントに分離することで、
// 毎秒の re-render が DailyInputForm 全体に波及しないようにする
export const TimerDisplay = memo(function TimerDisplay({ startedAt, breakMs, paused }: Props) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [paused])

  const elapsed = Date.now() - startedAt.getTime() - breakMs

  return (
    <div className="text-center text-4xl font-black tabular-nums mb-4 text-slate-800 tracking-tight">
      {formatMs(elapsed)}
      {paused && (
        <span className="block text-sm text-amber-500 font-bold mt-1">⏸ 停止中（休憩）</span>
      )}
    </div>
  )
})
