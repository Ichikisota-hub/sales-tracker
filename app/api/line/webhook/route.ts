import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface LineEvent {
  type: string
  replyToken?: string
  source: { type: string; groupId?: string; userId?: string }
  message?: { type: string; text?: string }
}

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function replyLine(replyToken: string, text: string) {
  return fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
}

async function pushLine(to: string, text: string) {
  return fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
}

// ─── 銀行情報収集フロー ──────────────────────────────────────────────
const BANK_QUESTIONS: Record<number, string> = {
  1: '銀行名を入力してください\n（例：三菱UFJ銀行、ゆうちょ銀行）',
  2: '支店名を入力してください\n（例：新宿支店）',
  3: '預金種別を入力してください\n「普通」または「当座」と送ってください',
  4: '口座番号を入力してください\n（数字のみ、例：1234567）',
  5: '口座名義をカタカナで入力してください\n（例：ヤマダ タロウ）',
}

async function handleBankFlow(lineUserId: string, text: string, replyToken: string): Promise<boolean> {
  const sb = getServiceSupabase()

  // セッション取得
  const { data: session } = await sb.from('line_bank_sessions' as any)
    .select('*').eq('line_user_id', lineUserId).maybeSingle() as any

  // キャンセル
  if (text === 'キャンセル' || text === 'cancel') {
    await (sb.from('line_bank_sessions' as any) as any).delete().eq('line_user_id', lineUserId)
    await replyLine(replyToken, '銀行情報の登録をキャンセルしました。\nいつでも「銀行情報」と送ると再開できます。')
    return true
  }

  // フロー開始トリガー
  if (!session && ['銀行情報', '口座登録', '銀行口座'].includes(text)) {
    let rep = null

    // 1. LINE IDで直接検索
    const { data: directRep } = await (sb.from('sales_reps') as any)
      .select('id,name,bank_name').eq('line_user_id', lineUserId).maybeSingle()
    rep = directRep

    // 2. 見つからない場合: kaikaのusersからLINE IDで名前を取得してsales_repsを名前検索
    if (!rep) {
      const { data: kaikaUser } = await (sb.from('users') as any)
        .select('name').eq('line_user_id', lineUserId).maybeSingle()
      if (kaikaUser?.name) {
        const name = kaikaUser.name.replace(/\s+/g, '')
        const { data: allReps } = await (sb.from('sales_reps') as any)
          .select('id,name,bank_name').eq('is_active', true)
        rep = allReps?.find((r: any) => {
          const rn = r.name.replace(/\s+/g, '')
          return rn === name || rn.includes(name) || name.includes(rn)
        }) ?? null

        // 名前でマッチしたらLINE IDを自動設定
        if (rep) {
          await (sb.from('sales_reps') as any).update({ line_user_id: lineUserId }).eq('id', rep.id)
        }
      }
    }

    if (!rep) {
      await replyLine(replyToken, '営業担当者として登録されていないため、銀行情報を登録できません。\n管理者にご連絡ください。')
      return true
    }
    const alreadyMsg = rep.bank_name ? `\n現在の登録: ${rep.bank_name}` : ''
    await (sb.from('line_bank_sessions' as any) as any).upsert({
      line_user_id: lineUserId, step: 1,
      temp_bank_name: null, temp_bank_branch: null, temp_account_type: null,
      temp_account_number: null, temp_account_holder: null,
      updated_at: new Date().toISOString(),
    })
    await replyLine(replyToken, `💳 銀行口座情報を登録します${alreadyMsg}\n\n「キャンセル」で中断できます\n\n${BANK_QUESTIONS[1]}`)
    return true
  }

  if (!session) return false

  const step: number = session.step

  // ステップ3: 普通/当座
  if (step === 3) {
    const norm = text.replace(/預金|口座/g, '')
    if (!['普通', '当座'].includes(norm)) {
      await replyLine(replyToken, '「普通」または「当座」を入力してください。')
      return true
    }
    await (sb.from('line_bank_sessions' as any) as any).update({ temp_account_type: norm + '預金', step: 4, updated_at: new Date().toISOString() }).eq('line_user_id', lineUserId)
    await replyLine(replyToken, `預金種別: ${norm}預金 ✅\n\n${BANK_QUESTIONS[4]}`)
    return true
  }

  // ステップ4: 口座番号バリデーション
  if (step === 4) {
    if (!/^\d{4,8}$/.test(text)) {
      await replyLine(replyToken, '口座番号は数字のみで入力してください（4〜8桁）。')
      return true
    }
    await (sb.from('line_bank_sessions' as any) as any).update({ temp_account_number: text, step: 5, updated_at: new Date().toISOString() }).eq('line_user_id', lineUserId)
    await replyLine(replyToken, `口座番号: ${text} ✅\n\n${BANK_QUESTIONS[5]}`)
    return true
  }

  // ステップ6: 確認
  if (step === 6) {
    if (['確定', 'はい', 'OK', 'ok'].includes(text)) {
      const { error } = await (sb.from('sales_reps') as any).update({
        bank_name: session.temp_bank_name,
        bank_branch: session.temp_bank_branch,
        bank_account_type: session.temp_account_type,
        bank_account_number: session.temp_account_number,
        bank_account_holder: session.temp_account_holder,
      }).eq('line_user_id', lineUserId)
      await (sb.from('line_bank_sessions' as any) as any).delete().eq('line_user_id', lineUserId)
      if (error) {
        await replyLine(replyToken, '⚠️ 保存中にエラーが発生しました。管理者にご連絡ください。')
      } else {
        await replyLine(replyToken,
          `✅ 銀行口座情報を登録しました！\n\n🏦 銀行名：${session.temp_bank_name}\n🏢 支店名：${session.temp_bank_branch}\n📋 種別：${session.temp_account_type}\n🔢 口座番号：${session.temp_account_number}\n👤 名義：${session.temp_account_holder}\n\nお支払い時に使用します。\n変更は「銀行情報」と送ってください。`)
      }
      return true
    }
    if (['修正', 'やり直し'].includes(text)) {
      await (sb.from('line_bank_sessions' as any) as any).update({ step: 1, updated_at: new Date().toISOString() }).eq('line_user_id', lineUserId)
      await replyLine(replyToken, `最初からやり直します。\n\n${BANK_QUESTIONS[1]}`)
      return true
    }
    await replyLine(replyToken, '「確定」で登録、「修正」でやり直しができます。')
    return true
  }

  // ステップ1・2・5: そのまま保存して次へ
  const fieldMap: Record<number, string> = { 1: 'temp_bank_name', 2: 'temp_bank_branch', 5: 'temp_account_holder' }
  const field = fieldMap[step]
  const nextStep = step + 1
  await (sb.from('line_bank_sessions' as any) as any).update({ [field]: text, step: nextStep, updated_at: new Date().toISOString() }).eq('line_user_id', lineUserId)

  if (nextStep <= 5) {
    const label = ['', '銀行名', '支店名', '預金種別', '口座番号', '口座名義'][step]
    await replyLine(replyToken, `${label}: ${text} ✅\n\n${BANK_QUESTIONS[nextStep]}`)
  } else {
    const s = { ...session, [field]: text }
    await replyLine(replyToken,
      `以下の内容で登録します：\n\n🏦 銀行名：${s.temp_bank_name}\n🏢 支店名：${s.temp_bank_branch}\n📋 種別：${s.temp_account_type}\n🔢 口座番号：${s.temp_account_number}\n👤 名義：${text}\n\n「確定」で登録\n「修正」でやり直し\n「キャンセル」で中断`)
  }
  return true
}
// ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as { events: LineEvent[] }

  for (const event of body.events ?? []) {
    const groupId    = event.source?.groupId
    const userId     = event.source?.userId
    const rawText    = event.message?.text ?? ''
    const text       = rawText.toLowerCase()
    const replyToken = event.replyToken

    console.log('[LINE Webhook]', JSON.stringify({ type: event.type, sourceType: event.source.type, groupId, userId, text: rawText }))

    // グループ内で「groupid」と送るとグループIDを返信
    if (groupId && text.includes('groupid')) {
      const msg = `グループID:\n${groupId}`
      if (replyToken) await replyLine(replyToken, msg)
      else await pushLine(groupId, msg)
    }

    // 個人DMで「groupid」→ユーザーIDを返信
    if (!groupId && userId && text.includes('groupid') && replyToken) {
      await replyLine(replyToken, `あなたのユーザーID:\n${userId}`)
    }

    // DM: 銀行情報収集フロー
    if (event.type === 'message' && event.message?.type === 'text' && !groupId && replyToken && userId) {
      const handled = await handleBankFlow(userId, rawText.trim(), replyToken)
      if (handled) continue
    }
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'LINE webhook is active' })
}
