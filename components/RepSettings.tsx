'use client'

import { useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'

type Props = { reps: SalesRep[]; onUpdate: () => void }

export default function RepSettings({ reps, onUpdate }: Props) {
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleChange(id: string, value: string) {
    setEditing(prev => ({ ...prev, [id]: value }))
  }

  async function saveAll() {
    setSaving(true)
    const updates = Object.entries(editing)
    for (const [id, name] of updates) {
      if (name.trim()) {
        await supabase.from('sales_reps').update({ name: name.trim() }).eq('id', id)
      }
    }
    setSaving(false)
    setSaved(true)
    setEditing({})
    onUpdate()
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-md bg-white rounded shadow p-4">
      <h2 className="font-bold text-sm mb-3 text-gray-800">担当者名設定（20名）</h2>
      <p className="text-xs text-gray-500 mb-3">担当者名を入力してください。空欄のままにすることもできます。</p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {reps.map((rep, i) => (
          <div key={rep.id} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-6 text-right">{i + 1}.</span>
            <input
              type="text"
              value={editing[rep.id] !== undefined ? editing[rep.id] : rep.name}
              onChange={e => handleChange(rep.id, e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs flex-1 focus:outline-none focus:border-blue-400"
              placeholder={`担当者${i + 1}`}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={saveAll}
          disabled={saving || Object.keys(editing).length === 0}
          className="bg-blue-600 text-white text-xs px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {saved && <span className="text-green-600 text-xs">✓ 保存しました</span>}
        {Object.keys(editing).length > 0 && !saving && (
          <span className="text-orange-500 text-xs">{Object.keys(editing).length}件の変更あり</span>
        )}
      </div>
    </div>
  )
}
