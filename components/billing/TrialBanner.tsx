'use client'

import { useOrganization } from '@/contexts/OrganizationContext'

export default function TrialBanner() {
  const { organization } = useOrganization()

  if (!organization || organization.plan !== 'trial' || !organization.trial_ends_at) return null

  const trialEnd = new Date(organization.trial_ends_at)
  const now = new Date()
  const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysLeft <= 0) {
    return (
      <div className="bg-red-600 text-white text-center text-xs font-bold py-2 px-4">
        トライアル期間が終了しました。サービスを継続するにはプランを選択してください。
      </div>
    )
  }

  if (daysLeft > 7) return null

  return (
    <div className="bg-amber-500 text-white text-center text-xs font-bold py-2 px-4">
      トライアル残り {daysLeft} 日 — プランを選択してサービスを継続
    </div>
  )
}
