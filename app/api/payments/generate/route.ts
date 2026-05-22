import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generatePaymentHtml, calculatePayment, PaymentDetail, ContractItem, SalesRep, IncentiveRate } from '@/lib/generatePaymentHtml'

function getTeamBonus(teamOpenings: number): number {
  if (teamOpenings <= 0)   return 0
  if (teamOpenings <= 30)  return teamOpenings * 2000
  if (teamOpenings <= 50)  return teamOpenings * 4000
  if (teamOpenings <= 69)  return teamOpenings * 5000
  return teamOpenings * 6000
}

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient()
  const { year, month, organizationId } = await req.json() as { year: number; month: number; organizationId?: string }

  if (!year || !month) return NextResponse.json({ error: 'year, month required' }, { status: 400 })

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`

  // 対象月に acquired_date がある契約（開通カウント用）
  const { data: contracts, error: cErr } = await supabase
    .from('contracts')
    .select('*')
    .gte('acquired_date', startDate)
    .lt('acquired_date', endDate)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // 対象月に cancellation_date がある契約（解約カウント用）
  const { data: cancelContracts } = await supabase
    .from('contracts')
    .select('*')
    .gte('cancellation_date', startDate)
    .lt('cancellation_date', endDate)

  // アクティブな担当者（organization_id で絞り込み）
  const repsQuery = supabase.from('sales_reps').select('*').eq('is_active', true)
  const { data: reps } = organizationId
    ? await repsQuery.eq('organization_id', organizationId)
    : await repsQuery

  // インセンティブレートマスタ
  const { data: rates } = await supabase.from('incentive_rates').select('*')

  // チーム情報（リーダーボーナス用）
  const { data: teams } = await supabase.from('teams').select('*')

  // 稼働日数を daily_records から集計（record_date + work_status='稼働' + 重複排除）
  const { data: dailyRecords } = await supabase
    .from('daily_records')
    .select('sales_rep_id, record_date')
    .eq('work_status', '稼働')
    .gte('record_date', startDate)
    .lt('record_date', endDate)

  // 重複排除: rep ごとの distinct な稼働日数を計算
  const workingDaysMap: Record<string, Set<string>> = {}
  for (const r of (dailyRecords ?? []) as { sales_rep_id: string; record_date: string }[]) {
    if (!workingDaysMap[r.sales_rep_id]) workingDaysMap[r.sales_rep_id] = new Set()
    workingDaysMap[r.sales_rep_id].add(r.record_date)
  }
  const workingDaysCount: Record<string, number> = Object.fromEntries(
    Object.entries(workingDaysMap).map(([id, s]) => [id, s.size])
  )

  const rateMap: Record<string, IncentiveRate> = {}
  ;(rates ?? []).forEach((r: IncentiveRate) => { rateMap[r.rank] = r })

  const results = []

  for (const rep of (reps ?? []) as SalesRep[]) {
    const repContracts = (contracts ?? []).filter(
      (c: ContractItem & { sales_rep_id: string }) => c.sales_rep_id === rep.id
    ) as (ContractItem & { sales_rep_id: string })[]

    // アポインターとして提供し他者がクロージングした件数
    const asApoContracts = (contracts ?? []).filter(
      (c: ContractItem & { apo_rep_id: string | null; sales_rep_id: string }) =>
        c.apo_rep_id === rep.id && c.sales_rep_id !== rep.id && c.status === '開通'
    ) as ContractItem[]

    const openSelf = repContracts.filter(c => c.status === '開通' && !c.apo_rep_id)
    const openApo  = repContracts.filter(c => c.status === '開通' && c.apo_rep_id)
    const repCancelContracts = ((cancelContracts ?? []) as (ContractItem & { sales_rep_id: string })[])
      .filter(c => c.sales_rep_id === rep.id)
    const cancelCount = repCancelContracts.length
    const openCount = openSelf.length + openApo.length

    const cancelRate = (openCount + cancelCount) > 0
      ? cancelCount / (openCount + cancelCount)
      : 0
    const cancelRateExceeded = cancelRate > 0.12

    const rank = rep.incentive_rank ?? 'アポインター'
    let rate = rateMap[rank] ?? { rank, rate_per_contract: 20000, apo_rate: 20000 }
    const workingDays = workingDaysCount[rep.id] ?? 0

    // クローザー1 → クローザー2 自動昇格チェック（今月条件: 8稼働日以上 + 2件以上開通）
    if (rank === 'クローザー1' && workingDays >= 8 && openCount >= 2) {
      const closer2 = rateMap['クローザー2']
      if (closer2) rate = closer2
    }

    if (openCount === 0 && asApoContracts.length === 0) continue

    // チームリーダーボーナス計算
    let teamBonus = 0
    if (rank === 'チームリーダー') {
      const team = (teams ?? []).find((t: { leader_rep_id: string | null }) => t.leader_rep_id === rep.id)
      if (team) {
        const teamMemberIds = (reps ?? [])
          .filter((r: SalesRep & { team_id?: string }) => r.team_id === (team as { id: string }).id)
          .map((r: SalesRep) => r.id)
        const teamOpenings = (contracts ?? []).filter(
          (c: ContractItem & { sales_rep_id: string }) =>
            teamMemberIds.includes(c.sales_rep_id) && c.status === '開通'
        ).length
        teamBonus = getTeamBonus(teamOpenings)
      }
    }

    const detail: PaymentDetail = {
      rep,
      periodYear: year,
      periodMonth: month,
      selfContracts: openSelf,
      apoContracts: openApo,
      asApoContracts,
      cancelContracts: repCancelContracts,
      cancelCount,
      workingDays,
      rate,
      cancelRateExceeded,
      teamBonus,
    }

    const htmlContent = generatePaymentHtml(detail)
    const { grossAmount, optionDeduction, cancelPenalty, transferFee, netAmount } = calculatePayment(detail)

    const { data: saved } = await supabase
      .from('payment_notifications')
      .upsert({
        sales_rep_id: rep.id,
        period_year: year,
        period_month: month,
        opening_count: openCount + asApoContracts.length,
        cancel_count: cancelCount,
        working_days: workingDays,
        gross_amount: grossAmount,
        option_deduction: optionDeduction,
        cancel_penalty: cancelPenalty,
        transfer_fee: transferFee,
        net_amount: netAmount,
        cancel_rate_exceeded: cancelRateExceeded,
        html_content: htmlContent,
      }, { onConflict: 'sales_rep_id,period_year,period_month' })
      .select()
      .single()

    results.push({
      repId: rep.id,
      repName: rep.name,
      openingCount: openCount + asApoContracts.length,
      cancelCount,
      cancelRateExceeded,
      netAmount,
      notificationId: saved?.id,
    })
  }

  return NextResponse.json({ ok: true, results })
}
