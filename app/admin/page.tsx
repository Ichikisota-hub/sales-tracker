'use client'

import { useOrganization } from '@/contexts/OrganizationContext'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Link from 'next/link'

export default function AdminPage() {
  const { organization } = useOrganization()
  const { signOut } = useAuth()
  const supabase = createClient()
  const [memberCount, setMemberCount] = useState(0)
  const [sheetId, setSheetId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!organization) return
    setSheetId(organization.settings?.google_sheet_id || '')
    loadMemberCount()
  }, [organization?.id])

  async function loadMemberCount() {
    if (!organization) return
    const { count } = await supabase
      .from('organization_members')
      .select('id', { count: 'exact' })
      .eq('organization_id', organization.id)
    setMemberCount(count || 0)
  }

  async function saveSheetId() {
    if (!organization) return
    setSaving(true)
    await supabase
      .from('organizations')
      .update({ settings: { ...organization.settings, google_sheet_id: sheetId } })
      .eq('id', organization.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }


  const trialEnd = organization?.trial_ends_at ? new Date(organization.trial_ends_at) : null
  const daysLeft = trialEnd
    ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ナビゲーション */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-white text-sm">← アプリへ戻る</Link>
          <span className="text-slate-600">|</span>
          <h1 className="font-bold text-sm">組織管理</h1>
        </div>
        <button onClick={signOut} className="text-slate-400 hover:text-white text-xs">ログアウト</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4 mt-4">

        {/* 組織情報 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-4">組織情報</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">組織名</span>
              <span className="font-semibold text-slate-800">{organization?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">プラン</span>
              <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${
                organization?.plan === 'trial' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
                {organization?.plan === 'trial' ? 'トライアル' : organization?.plan}
              </span>
            </div>
            {daysLeft !== null && organization?.plan === 'trial' && (
              <div className="flex justify-between">
                <span className="text-slate-500">トライアル残日数</span>
                <span className={`font-bold ${daysLeft <= 3 ? 'text-red-600' : 'text-slate-800'}`}>
                  {daysLeft > 0 ? `${daysLeft}日` : '期限切れ'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">メンバー</span>
              <span className="font-semibold text-slate-800">
                {memberCount} / {organization?.max_members} 名
              </span>
            </div>
          </div>
        </div>

        {/* Google Sheets 設定 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-1">Google スプレッドシート設定</h2>
          <p className="text-slate-500 text-xs mb-4">シフト連携に使用するスプレッドシートの ID を設定します</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={sheetId}
              onChange={e => setSheetId(e.target.value)}
              placeholder="スプレッドシート ID"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={saveSheetId}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              {saved ? '保存済み ✓' : saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* メンバー管理リンク */}
        <Link href="/admin/members"
          className="block bg-white rounded-xl shadow-sm p-5 hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">メンバー管理</h2>
              <p className="text-slate-500 text-xs mt-0.5">メンバーの招待・ロール変更・削除</p>
            </div>
            <span className="text-slate-400 text-lg">→</span>
          </div>
        </Link>

      </div>
    </div>
  )
}
