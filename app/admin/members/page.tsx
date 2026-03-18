'use client'

import { useState } from 'react'
import MemberList from '@/components/admin/MemberList'
import InviteForm from '@/components/admin/InviteForm'
import Link from 'next/link'

export default function MembersPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm">← 組織管理</Link>
        <span className="text-slate-600 mx-2">|</span>
        <h1 className="font-bold text-sm">メンバー管理</h1>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4 mt-4">
        <InviteForm onInvited={() => setRefreshKey(k => k + 1)} />
        <MemberList refreshKey={refreshKey} />
      </div>
    </div>
  )
}
