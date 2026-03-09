'use client'

import { useState } from 'react'
import { supabase, SalesRep } from '@/lib/supabase'

type Props = { reps: SalesRep[]; onUpdate: () => void }

export default function RepSettings({ reps, onUpdate }: Props) {
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  function handleChange(id: string, value: string) {
    setEditing(prev => ({ ...prev, [id]: value }))
    setSaved(false)
  }

  async function saveAll() {
    setSaving(true)
    for (const [id, name] of Object.entries(editing)) {
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

  async function addRep() {
    if (!newName.trim()) return
    setAdding(true)
    const maxOrder = reps.length > 0 ? Math.max(...reps.map(r => r.display_order)) : 0
    await supabase.from('sales_reps').insert({
      name: newName.trim(),
      display_order: maxOrder + 1,
    })
    setNewName('')
    setAdding(false)
    onUpdate()
  }

  async function deleteRep(id: string) {
    await supabase.from('sales_reps').delete().eq('id', id)
    setDeleteConfirm(null)
    onUpdate()
  }

  return (
    <div className="max-w-md space-y-4">

      {/* 担当者一覧・編集 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-bold text-sm mb-1 text-gray-800">担当者一覧</h2>
        <p className="text-xs text-gray-400 mb-3">名前を編集して「保存」を押してください</p>

        <div className="space-y-2 mb-4">
          {reps.map((rep, i) => (
            <div key={rep.id} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
              <input
                type="text"
                value={editing[rep.id] !== undefined ? editing[rep.id] : rep.name}
                onChange={e => handleChange(rep.id, e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:border-blue-400"
                placeholder={`担当者${i + 1}`}
              />
              {/* 削除ボタン */}
              {deleteConfirm === rep.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => deleteRep(rep.id)}
                    className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg font-medium hover:bg-red-600"
                  >
                    削除
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200"
                  >
                    戻る
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(rep.id)}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors px-1 font-bold text-lg leading-none"
                  title="削除"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveAll}
            disabled={saving || Object.keys(editing).length === 0}
            className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '保存中...' : '💾 保存'}
          </button>
          {saved && <span className="text-green-600 text-xs font-medium">✓ 保存しました</span>}
          {Object.keys(editing).length > 0 && !saving && (
            <span className="text-orange-500 text-xs">{Object.keys(editing).length}件の変更あり</span>
          )}
        </div>
      </div>

      {/* 担当者追加 */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-bold text-sm mb-1 text-gray-800">担当者を追加</h2>
        <p className="text-xs text-gray-400 mb-3">新しい担当者名を入力してください</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRep()}
            placeholder="担当者名を入力..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={addRep}
            disabled={adding || !newName.trim()}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {adding ? '追加中...' : '＋ 追加'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">現在 {reps.length} 名登録中</p>
      </div>

    </div>
  )
}
