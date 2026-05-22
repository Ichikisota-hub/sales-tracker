import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generatePaymentHtml, calculatePayment, PaymentDetail, ContractItem, SalesRep, IncentiveRate } from '@/lib/generatePaymentHtml'

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient()
  const { year, month } = await req.json() as { year: number; month: number }

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

  // 全アクティブな担当者を取得
  const { data: reps } = await supabase
    .from('sales_reps')
    .select('*')
    .eq('is_active', true)

  // インセンティブレートマスタ
  const { data: rates } = await supabase
    .from('incentive_rates')
    .select('*')

  // daily_records で稼働日数を集計
  const { data: dailyRecords } = await supabase
    .from('daily_records')
    .select('sales_rep_id, date')
    .gte('date', startDate)
    .lt('date', endDate)

  const workingDaysMap: Record<string, number> = {}
  ;(dailyRecords ?? []).forEach((r: { sales_rep_id: string }) => {
    workingDaysMap[r.sales_rep_id] = (workingDaysMap[r.sales_rep_id] ?? 0) + 1
  })

  const rateMap: Record<string, IncentiveRate> = {}
  ;(rates ?? []).forEach((r: IncentiveRate) => { rateMap[r.rank] = r })

  const results = []

  for (const rep of (reps ?? []) as SalesRep[]) {
    const repContracts = (contracts ?? []).filter(
      (c: ContractItem & { sales_rep_id: string }) => c.sales_rep_id === rep.id
    ) as (ContractItem & { sales_rep_id: string })[]

    // アポインターとして提供し他者がクロージングした件数
    const asApoContracts = (contracts ?? []).filter(
      (c: ContractItem & { sales_rep_id: string }) =>
        c.apo_rep_id === rep.id && c.sales_rep_id !== rep.id && c.status === '開通'
    ) as ContractItem[]

    const openSelf = repContracts.filter(c => c.status === '開通' && !c.apo_rep_id)
    const openApo  = repContracts.filter(c => c.status === '開通' && c.apo_rep_id)
    // 解約は cancellation_date が当月にある契約で集計
    const repCancelContracts = ((cancelContracts ?? []) as (ContractItem & { sales_rep_id: string })[])
      .filter(c => c.sales_rep_id === rep.id)
    const cancelCount = repCancelContracts.length
    const openCount = openSelf.length + openApo.length

    // キャンセル率計算（自分が引っ張った契約のみ）
    const cancelRate = (openCount + cancelCount) > 0
      ? cancelCount / (openCount + cancelCount)
      : 0
    const cancelRateExceeded = cancelRate > 0.12

    const rank = rep.incentive_rank ?? 'アポインター'
    const rate = rateMap[rank] ?? { rank, rate_per_contract: 20000, apo_rate: 20000 }

    const workingDays = workingDaysMap[rep.id] ?? 0

    if (openCount === 0 && asApoContracts.length === 0) continue // 開通なしはスキップ

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
    }

    const htmlContent = generatePaymentHtml(detail)

    const { grossAmount, optionDeduction, cancelPenalty, transferFee, netAmount } =
      calculatePayment(detail)

    // payment_notifications に upsert
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
