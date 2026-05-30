export type SalaryStatus = {
  repId: string
  name: string
  rank: string
  workDays: number
  acquisitions: number
  appliedRate: number
  estimatedGross: number
  conditionMet: boolean
  conditionLabel: string
  statusLevel: 'green' | 'yellow' | 'red'
}

export function calcSalaryStatus(
  rep: { id: string; name: string; incentive_rank?: string },
  workDays: number,
  acquisitions: number,
  baseRate: number,
): SalaryStatus {
  const rank = rep.incentive_rank ?? 'アポインター'
  let appliedRate = baseRate
  let conditionMet = true
  let conditionLabel = '条件達成'
  let statusLevel: 'green' | 'yellow' | 'red' = 'green'

  switch (rank) {
    case '旧Lメンバー': {
      if (workDays > 8 && acquisitions > 5) {
        appliedRate = 40000
        conditionLabel = '40,000円/件 適用中'
        statusLevel = 'green'
      } else {
        appliedRate = 37000
        conditionMet = false
        const reasons: string[] = []
        if (workDays <= 8) reasons.push(`稼働${workDays}日/9日以上`)
        if (acquisitions <= 5) reasons.push(`獲得${acquisitions}件/6件以上`)
        conditionLabel = `37,000円適用（${reasons.join('・')}）`
        statusLevel = 'red'
      }
      break
    }
    case 'クローザー2': {
      conditionMet = workDays >= 8 && acquisitions >= 2
      if (!conditionMet) {
        statusLevel = 'red'
        const reasons: string[] = []
        if (workDays < 8) reasons.push(`稼働${workDays}/8日`)
        if (acquisitions < 2) reasons.push(`獲得${acquisitions}/2件`)
        conditionLabel = `条件不足（${reasons.join('・')}）`
      }
      break
    }
    case 'クローザー1': {
      // 累計5件達成で昇格したランク。昇格後はその月の件数に関わらず常に条件達成扱い
      conditionMet = true
      conditionLabel = '条件達成'
      statusLevel = 'green'
      break
    }
    case 'ミニチームリーダー①':
    case 'ミニチームリーダー②': {
      conditionMet = acquisitions >= 5 && workDays >= 11
      if (!conditionMet) {
        statusLevel = acquisitions >= 3 || workDays >= 8 ? 'yellow' : 'red'
        const reasons: string[] = []
        if (acquisitions < 5) reasons.push(`獲得${acquisitions}/5件`)
        if (workDays < 11) reasons.push(`稼働${workDays}/11日`)
        conditionLabel = `条件不足（${reasons.join('・')}）`
      }
      break
    }
    case 'チームリーダー': {
      conditionMet = acquisitions >= 12 && workDays >= 18
      if (!conditionMet) {
        statusLevel = acquisitions >= 8 || workDays >= 13 ? 'yellow' : 'red'
        const reasons: string[] = []
        if (acquisitions < 12) reasons.push(`獲得${acquisitions}/12件`)
        if (workDays < 18) reasons.push(`稼働${workDays}/18日`)
        conditionLabel = `条件不足（${reasons.join('・')}）`
      }
      break
    }
    case 'アポインター': {
      const remaining = Math.max(0, 5 - acquisitions)
      if (remaining > 0) {
        conditionLabel = `クローザー1昇格まで残${remaining}件`
        statusLevel = acquisitions >= 3 ? 'yellow' : 'green'
        conditionMet = false
      } else {
        conditionLabel = 'クローザー1昇格条件達成'
        statusLevel = 'green'
      }
      break
    }
    default:
      conditionLabel = '—'
  }

  return {
    repId: rep.id,
    name: rep.name,
    rank,
    workDays,
    acquisitions,
    appliedRate,
    estimatedGross: acquisitions * appliedRate,
    conditionMet,
    conditionLabel,
    statusLevel,
  }
}
