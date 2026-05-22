// 支払通知書HTML生成（別紙２ 成果報酬規定に基づく）

export interface ContractItem {
  id: string
  customer_name: string
  status: string
  acquired_date: string
  apo_rep_id: string | null
  // オプションフラグ
  opt_s_safe: boolean
  opt_v6_router: boolean
  opt_support_plus: boolean
  opt_data_recovery: boolean
  opt_kurashi_mamori: boolean
  opt_benefit_station: boolean
  opt_lawyer_insurance: boolean
  opt_valed_drive: boolean
}

export interface SalesRep {
  id: string
  name: string
  incentive_rank: string
  bank_name?: string
  bank_branch?: string
  bank_account_type?: string
  bank_account_number?: string
  bank_account_holder?: string
}

export interface IncentiveRate {
  rank: string
  rate_per_contract: number
  apo_rate: number
}

export interface PaymentDetail {
  rep: SalesRep
  periodYear: number
  periodMonth: number
  // 自分がクローザーとして開通させた契約（自己アポ）
  selfContracts: ContractItem[]
  // 自分がクローザーとして開通させた契約（アポインターのアポ）
  apoContracts: ContractItem[]
  // 自分がアポインターとして提供し、他者がクローズした契約
  asApoContracts: ContractItem[]
  cancelCount: number
  workingDays: number
  rate: IncentiveRate
  cancelRateExceeded: boolean
}

const OPT_DEDUCTIONS: { key: keyof ContractItem; label: string; amount: number }[] = [
  { key: 'opt_s_safe',           label: 'S-SAFE 未適用',                  amount: 6000 },
  { key: 'opt_v6_router',        label: 'So-net v6プラス対応ルーター 未適用', amount: 5000 },
  { key: 'opt_support_plus',     label: 'So-net 安心サポートプラス 未適用',   amount: 4000 },
  { key: 'opt_data_recovery',    label: 'So-net 備えて安心データ復旧 未適用', amount: 2000 },
  { key: 'opt_kurashi_mamori',   label: 'So-net くらしのお守りワイド 未適用', amount: 2000 },
  { key: 'opt_benefit_station',  label: 'Benefit Station for So-net 未適用', amount: 2000 },
  { key: 'opt_lawyer_insurance', label: '弁護士費用保証 未適用',              amount: 1000 },
  { key: 'opt_valed_drive',      label: 'バレッドライブ for So-net 未適用',   amount: 500  },
]

function calcContractAmount(contract: ContractItem, unitRate: number): { base: number; deductions: number } {
  let deductions = 0
  OPT_DEDUCTIONS.forEach(({ key, amount }) => {
    if (!contract[key]) deductions += amount
  })
  return { base: unitRate, deductions }
}

export function calculatePayment(detail: PaymentDetail): {
  lineItems: { label: string; qty: number; unitPrice: number; amount: number }[]
  grossAmount: number
  optionDeduction: number
  cancelPenalty: number
  transferFee: number
  netAmount: number
  taxBase: number
  tax: number
  totalWithTax: number
  paymentDate: string
} {
  const lineItems: { label: string; qty: number; unitPrice: number; amount: number }[] = []
  let grossAmount = 0
  let optionDeduction = 0
  const cancelPenalty = 0
  const transferFee = 220

  // キャンセル率超過ペナルティ
  const penaltyPerUnit = detail.cancelRateExceeded ? 3300 : 0

  // 自己アポ開通件数
  if (detail.selfContracts.length > 0) {
    const unitRate = detail.rate.rate_per_contract - penaltyPerUnit
    const label = `${detail.rep.incentive_rank}（自己アポ）開通`
    let subtotal = 0
    detail.selfContracts.forEach(c => {
      const { base, deductions } = calcContractAmount(c, unitRate)
      subtotal += base - deductions
      optionDeduction += deductions
    })
    const qty = detail.selfContracts.length
    lineItems.push({ label, qty, unitPrice: unitRate, amount: subtotal })
    grossAmount += qty * unitRate
  }

  // アポ受けクロージング件数
  if (detail.apoContracts.length > 0) {
    const unitRate = detail.rate.apo_rate - penaltyPerUnit
    const label = 'クロージング（アポインター案件）'
    let subtotal = 0
    detail.apoContracts.forEach(c => {
      const { base, deductions } = calcContractAmount(c, unitRate)
      subtotal += base - deductions
      optionDeduction += deductions
    })
    const qty = detail.apoContracts.length
    lineItems.push({ label, qty, unitPrice: unitRate, amount: subtotal })
    grossAmount += qty * unitRate
  }

  // アポインターとして提供した件数
  if (detail.asApoContracts.length > 0) {
    const unitRate = detail.rate.apo_rate - penaltyPerUnit
    const label = 'アポ提供（開通確認分）'
    const qty = detail.asApoContracts.length
    lineItems.push({ label, qty, unitPrice: unitRate, amount: qty * unitRate })
    grossAmount += qty * unitRate
  }

  if (detail.cancelRateExceeded && (detail.selfContracts.length + detail.apoContracts.length + detail.asApoContracts.length) > 0) {
    lineItems.push({
      label: 'キャンセル率超過控除（12%超）',
      qty: detail.selfContracts.length + detail.apoContracts.length + detail.asApoContracts.length,
      unitPrice: -3300,
      amount: -(detail.selfContracts.length + detail.apoContracts.length + detail.asApoContracts.length) * 3300,
    })
  }

  if (optionDeduction > 0) {
    lineItems.push({ label: 'オプション未適用控除', qty: 1, unitPrice: -optionDeduction, amount: -optionDeduction })
  }

  lineItems.push({ label: '振込手数料', qty: 1, unitPrice: -transferFee, amount: -transferFee })

  const netAmount = grossAmount - optionDeduction - cancelPenalty - transferFee -
    (detail.cancelRateExceeded ? (detail.selfContracts.length + detail.apoContracts.length + detail.asApoContracts.length) * 3300 : 0)

  const taxBase = Math.floor(netAmount / 1.1)
  const tax = netAmount - taxBase

  // 支払日: 引っ張り月 +2ヶ月 3日
  let payYear = detail.periodYear
  let payMonth = detail.periodMonth + 2
  if (payMonth > 12) { payMonth -= 12; payYear += 1 }
  const paymentDate = `${payYear}年${payMonth}月3日`

  return { lineItems, grossAmount, optionDeduction, cancelPenalty, transferFee, netAmount, taxBase, tax, totalWithTax: netAmount, paymentDate }
}

export function generatePaymentHtml(detail: PaymentDetail): string {
  const calc = calculatePayment(detail)
  const issueDate = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const periodLabel = `${detail.periodYear}年${detail.periodMonth}月分`
  const { rep } = detail

  const rowsHtml = calc.lineItems.map(item => `
    <tr${item.amount < 0 ? ' class="deduction-row"' : ''}>
      <td>${item.label}</td>
      <td class="text-center">${item.qty < 0 || item.unitPrice < 0 ? '—' : `× ${item.qty}`}</td>
      <td class="text-right">${item.amount < 0 ? `▲ ¥${Math.abs(item.amount).toLocaleString()}` : `¥${item.amount.toLocaleString()}`}</td>
    </tr>`).join('')

  const bankSection = rep.bank_name ? `
    <div class="bank-section">
      <h3>お振込先口座</h3>
      <div class="bank-grid">
        <span class="bank-label">銀行名</span><span>${rep.bank_name}</span>
        <span class="bank-label">支店名</span><span>${rep.bank_branch ?? ''}</span>
        <span class="bank-label">口座種別</span><span>${rep.bank_account_type ?? '普通預金'}</span>
        <span class="bank-label">口座番号</span><span>${rep.bank_account_number ?? ''}</span>
        <span class="bank-label">口座名義</span><span>${rep.bank_account_holder ?? ''}</span>
      </div>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>業務委託手数料支払通知書 - ${rep.name}様</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", "MS Gothic", sans-serif; font-size: 11pt; color: #000; background: #fff; }
  .document { max-width: 170mm; margin: 0 auto; padding: 10mm 0; }
  .title { font-size: 20pt; font-weight: bold; text-align: center; margin-bottom: 6mm; letter-spacing: 4px; border-bottom: 3px solid #1a3a6b; padding-bottom: 4mm; }
  .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6mm; font-size: 10pt; color: #555; }
  .recipient { font-size: 16pt; font-weight: bold; margin: 4mm 0 2mm; }
  .greeting { margin-bottom: 6mm; line-height: 2; font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  th { background: #1a3a6b; color: white; padding: 6px 10px; font-size: 10pt; }
  td { padding: 7px 10px; border-bottom: 1px solid #ddd; font-size: 11pt; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .deduction-row td { color: #c00; }
  .subtotal-row td { border-top: 2px solid #1a3a6b; font-weight: bold; background: #f0f4fa; }
  .tax-table { width: 55%; margin-left: auto; margin-bottom: 6mm; border: 2px solid #1a3a6b; }
  .tax-table td { padding: 7px 12px; }
  .tax-table .label { background: #f0f4fa; font-weight: bold; font-size: 10.5pt; }
  .payment-row { background: #1a3a6b; }
  .payment-row td { color: white; font-weight: bold; font-size: 14pt; border: none; }
  .bank-section { border: 1px solid #aaa; padding: 4mm 5mm; margin-bottom: 6mm; border-radius: 4px; }
  .bank-section h3 { font-size: 11pt; border-bottom: 1px solid #aaa; padding-bottom: 3px; margin-bottom: 4px; color: #1a3a6b; }
  .bank-grid { display: grid; grid-template-columns: 90px 1fr 90px 1fr; gap: 4px 10px; font-size: 10.5pt; margin-top: 3mm; }
  .bank-label { color: #555; font-size: 10pt; }
  .issuer-section { border-top: 2px solid #1a3a6b; padding-top: 4mm; text-align: right; font-size: 10.5pt; line-height: 1.9; }
  .issuer-name { font-size: 13pt; font-weight: bold; }
</style>
</head>
<body>
<div class="document">
  <div class="title">業務委託手数料支払通知書</div>
  <div class="header-row">
    <span>発行日：${issueDate}</span>
    <span>支払対象期間：${periodLabel}</span>
  </div>
  <div class="recipient">${rep.name} 様</div>
  <div class="greeting">
    平素よりお世話になっております。<br>
    下記の通り、業務委託手数料をお支払いいたします。
  </div>

  <table>
    <thead><tr><th>項　目</th><th class="text-center">数量</th><th class="text-right">金　額</th></tr></thead>
    <tbody>
      ${rowsHtml}
      <tr class="subtotal-row">
        <td colspan="2">合　計</td>
        <td class="text-right">¥${calc.netAmount.toLocaleString()}</td>
      </tr>
    </tbody>
  </table>

  <table class="tax-table">
    <tr><td class="label">内　訳（税抜相当）</td><td class="text-right">¥${calc.taxBase.toLocaleString()}</td></tr>
    <tr><td class="label">消費税（10%）</td><td class="text-right">¥${calc.tax.toLocaleString()}</td></tr>
    <tr class="payment-row"><td>お支払金額</td><td class="text-right">¥${calc.totalWithTax.toLocaleString()}</td></tr>
  </table>

  <p style="font-size:10pt;color:#555;margin-bottom:4mm;">お支払予定日：${calc.paymentDate}</p>

  ${bankSection}

  <div class="issuer-section">
    <div class="issuer-name">ORIGIN</div>
    代表者：仁川 遥斗<br>
    〒530-0017 大阪府大阪市北区角田町8-47 阪急グランドビル 20F<br>
    E-mail：origin.nikawaharuto@gmail.com<br>
    TEL：090-9623-7296
  </div>
</div>
</body>
</html>`
}
