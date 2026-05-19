'use client'

import { useOrganization } from '@/contexts/OrganizationContext'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Link from 'next/link'
import AdminContractSheet from '@/components/admin/AdminContractSheet'

export default function AdminPage() {
  const { organization } = useOrganization()
  const { signOut } = useAuth()
  const supabase = createClient()
  const [memberCount, setMemberCount] = useState(0)
  const [sheetId, setSheetId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [backing, setBacking] = useState(false)
  const [backupResult, setBackupResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [sheetsConfigured, setSheetsConfigured] = useState<boolean | null>(null)
  const [noteMonth, setNoteMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [shiftNotes, setShiftNotes] = useState<{ rep_name: string; note: string }[]>([])
  const [notesLoading, setNotesLoading] = useState(false)

  useEffect(() => {
    if (!organization) return
    setSheetId(organization.settings?.google_sheet_id || '')
    loadMemberCount()
    checkSheetsConfig()
  }, [organization?.id])

  async function checkSheetsConfig() {
    try {
      const res = await fetch('/api/sheets/sync')
      const d = await res.json()
      setSheetsConfigured(d.configured)
    } catch {
      setSheetsConfigured(false)
    }
  }

  async function syncToSheets() {
    if (!organization || !sheetId) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: sheetId, orgIds: [organization.id] }),
      })
      const d = await res.json()
      if (res.ok) {
        const s = d.stats
        setSyncResult({ ok: true, message: `同期完了 ✓ 人別日次集計・担当者${s.reps}件・実績${s.records}件・シフト${s.schedules}件・契約${s.contracts}件・日報${s.reports}件` })
      } else {
        setSyncResult({ ok: false, message: d.error || 'エラーが発生しました' })
      }
    } catch (e: any) {
      setSyncResult({ ok: false, message: e.message })
    }
    setSyncing(false)
  }

  async function backupToSheets() {
    if (!organization || !sheetId) return
    setBacking(true)
    setBackupResult(null)
    try {
      const res = await fetch('/api/sheets/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: sheetId, orgIds: [organization.id] }),
      })
      const d = await res.json()
      if (res.ok) {
        const s = d.stats
        setBackupResult({ ok: true, message: `バックアップ完了 ✓ ${s.date} / 担当者${s.reps}件・実績${s.records}件・契約${s.contracts}件` })
      } else {
        setBackupResult({ ok: false, message: d.error || 'エラーが発生しました' })
      }
    } catch (e: any) {
      setBackupResult({ ok: false, message: e.message })
    }
    setBacking(false)
  }

  useEffect(() => {
    loadShiftNotes(noteMonth)
  }, [noteMonth, organization?.id])

  async function loadMemberCount() {
    if (!organization) return
    const { count } = await supabase
      .from('organization_members')
      .select('id', { count: 'exact' })
      .eq('organization_id', organization.id)
    setMemberCount(count || 0)
  }

  async function loadShiftNotes(month: string) {
    if (!organization) return
    setNotesLoading(true)
    const { data } = await supabase
      .from('monthly_plans')
      .select('note, sales_reps(name)')
      .eq('year_month', month)
      .eq('organization_id', organization.id)
      .not('note', 'is', null)
      .neq('note', '')
    setShiftNotes((data || []).map((d: { sales_reps: unknown; note: string | null }) => ({
      rep_name: (d.sales_reps as { name: string } | null)?.name || '不明',
      note: d.note || '',
    })))
    setNotesLoading(false)
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
          <p className="text-slate-500 text-xs mb-3">全データをリアルタイムでGoogleスプレッドシートへ同期します</p>

          {/* Service Account 未設定の警告 */}
          {sheetsConfigured === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800 space-y-1.5">
              <div className="font-bold">⚠️ Service Accountが未設定です</div>
              <div>データの書き込みにはGoogleサービスアカウントが必要です。</div>
              <ol className="list-decimal list-inside space-y-1 text-amber-700">
                <li>Google Cloud Console で Service Account を作成</li>
                <li>JSONキーをダウンロード</li>
                <li>Vercel環境変数 <code className="bg-amber-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code> にJSONを貼り付け</li>
                <li>下記スプレッドシートIDを保存し、シートをService Accountのメールで共有（編集者権限）</li>
              </ol>
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={sheetId}
              onChange={e => setSheetId(e.target.value)}
              placeholder="スプレッドシートID（URLの /d/XXXX/edit のXXXX部分）"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={saveSheetId}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              {saved ? '保存 ✓' : saving ? '保存中...' : '保存'}
            </button>
          </div>

          {/* 同期ボタン */}
          <button
            onClick={syncToSheets}
            disabled={syncing || !sheetId || sheetsConfigured === false}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {syncing ? (
              <><span className="animate-spin inline-block">⟳</span> 同期中...</>
            ) : (
              <>📤 今すぐ全データを同期</>
            )}
          </button>

          {syncResult && (
            <div className={`mt-2 text-xs px-3 py-2 rounded-lg font-medium ${syncResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {syncResult.message}
            </div>
          )}

          {/* バックアップボタン */}
          <button
            onClick={backupToSheets}
            disabled={backing || !sheetId || sheetsConfigured === false}
            className="w-full bg-slate-600 hover:bg-slate-500 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
          >
            {backing ? (
              <><span className="animate-spin inline-block">⟳</span> バックアップ中...</>
            ) : (
              <>🗂️ 日付付きバックアップを作成</>
            )}
          </button>
          <p className="text-xs text-slate-400 mt-1">本日の日付（例: 日別実績_2026-04-29）でシートを作成します。上書きされません。</p>

          {backupResult && (
            <div className={`mt-2 text-xs px-3 py-2 rounded-lg font-medium ${backupResult.ok ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
              {backupResult.message}
            </div>
          )}
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

        {/* データエクスポート */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-1">データエクスポート</h2>
          <p className="text-slate-500 text-xs mb-4">全データをExcelファイル（.xlsx）でダウンロードします。<br />担当者・チーム・月間計画・日別実績・シフト・契約宅・日報の7シートが含まれます。</p>
          <a
            href="/api/export"
            download
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            📥 Excelでダウンロード
          </a>
        </div>

        {/* シフト備考一覧 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">シフト備考一覧</h2>
            <input
              type="month"
              value={noteMonth}
              onChange={e => setNoteMonth(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {notesLoading ? (
            <p className="text-xs text-slate-400">読み込み中...</p>
          ) : shiftNotes.length === 0 ? (
            <p className="text-xs text-slate-400">この月の備考はありません</p>
          ) : (
            <div className="space-y-2">
              {shiftNotes.map((n, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-3">
                  <div className="text-xs font-bold text-slate-600 mb-1">{n.rep_name}</div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap">{n.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 契約宅一覧（全員・スプレッドシート形式） */}
      <div className="p-4 mt-2">
        <AdminContractSheet />
      </div>

    </div>
  )
}
