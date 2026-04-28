import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_KEY = 'Origin0201'
// superadminリストを保存するorg（ORIGIN）のID
const ORIGIN_ORG_ID = '0524dcfa-685f-4635-971b-39c7899da7cd'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function checkAuth(req: NextRequest) {
  return req.headers.get('x-superadmin-key') === SUPERADMIN_KEY
}

async function getSuperadminEmails(supabase: ReturnType<typeof getServiceClient>): Promise<string[]> {
  const { data } = await supabase.from('organizations').select('settings').eq('id', ORIGIN_ORG_ID).single()
  const emails: string[] = (data?.settings as any)?.superadmin_emails || []
  // ハードコードの初期値と合わせて返す
  const defaults = ['souta51203@gmail.com', 'origin.compamy001@gmail.com']
  const combined = [...defaults, ...emails]
  return combined.filter((e, i) => combined.indexOf(e) === i)
}

// GET: superadminメール一覧取得
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  const supabase = getServiceClient()
  const emails = await getSuperadminEmails(supabase)
  return NextResponse.json({ emails })
}

// POST: superadmin追加
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { email } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: 'emailが必要です' }, { status: 400 })

  const supabase = getServiceClient()
  const current = await getSuperadminEmails(supabase)
  const newEmail = email.trim().toLowerCase()

  if (current.includes(newEmail)) return NextResponse.json({ error: '既にsuperadminです' }, { status: 400 })

  const newList = [...current, newEmail]

  // settings に保存
  const { data: org } = await supabase.from('organizations').select('settings').eq('id', ORIGIN_ORG_ID).single()
  const merged = { ...(org?.settings || {}), superadmin_emails: newList }
  const { error } = await supabase.from('organizations').update({ settings: merged }).eq('id', ORIGIN_ORG_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Supabaseに存在しなければ招待メール送信
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const exists = users.find(u => u.email?.toLowerCase() === newEmail)
  if (!exists) {
    await supabase.auth.admin.inviteUserByEmail(newEmail, { data: { superadmin: true } })
  }

  return NextResponse.json({ success: true, emails: newList })
}

// DELETE: superadmin削除
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { email } = await req.json()
  const defaults = ['souta51203@gmail.com', 'origin.compamy001@gmail.com']
  if (defaults.includes(email)) return NextResponse.json({ error: 'このアカウントは削除できません' }, { status: 400 })

  const supabase = getServiceClient()
  const current = await getSuperadminEmails(supabase)
  const newList = current.filter(e => e !== email)

  const { data: org } = await supabase.from('organizations').select('settings').eq('id', ORIGIN_ORG_ID).single()
  const merged = { ...(org?.settings || {}), superadmin_emails: newList }
  const { error } = await supabase.from('organizations').update({ settings: merged }).eq('id', ORIGIN_ORG_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, emails: newList })
}
