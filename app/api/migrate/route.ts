import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const SQL_STATEMENTS = [
  `ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS apo_rep_id UUID,
    ADD COLUMN IF NOT EXISTS opt_s_safe BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opt_v6_router BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opt_support_plus BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opt_data_recovery BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opt_kurashi_mamori BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opt_benefit_station BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opt_lawyer_insurance BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opt_valed_drive BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE public.sales_reps
    ADD COLUMN IF NOT EXISTS incentive_rank TEXT NOT NULL DEFAULT 'アポインター',
    ADD COLUMN IF NOT EXISTS line_user_id TEXT,
    ADD COLUMN IF NOT EXISTS bank_name TEXT,
    ADD COLUMN IF NOT EXISTS bank_branch TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_type TEXT DEFAULT '普通預金',
    ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_holder TEXT`,
  `DROP TABLE IF EXISTS public.incentive_rates`,
  `CREATE TABLE public.incentive_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rank TEXT NOT NULL UNIQUE,
    rate_per_contract INTEGER NOT NULL,
    apo_rate INTEGER NOT NULL DEFAULT 20000,
    promotion_contracts INTEGER,
    promotion_working_days INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  `ALTER TABLE public.incentive_rates ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "incentive_rates_read" ON public.incentive_rates`,
  `CREATE POLICY "incentive_rates_read" ON public.incentive_rates FOR SELECT USING (true)`,
  `INSERT INTO public.incentive_rates (rank, rate_per_contract, apo_rate, promotion_contracts, promotion_working_days) VALUES
    ('アポインター', 20000, 20000, 5, NULL),
    ('クローザー1', 25000, 20000, NULL, NULL),
    ('クローザー2', 30000, 20000, 2, 8),
    ('ミニチームリーダー①', 20000, 20000, 5, 11),
    ('ミニチームリーダー②', 33000, 20000, 5, 11),
    ('幹部メンバー', 40000, 20000, 12, 18),
    ('チームリーダー', 36000, 20000, 12, 18)
  ON CONFLICT (rank) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS public.payment_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_rep_id UUID REFERENCES public.sales_reps(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    opening_count INTEGER NOT NULL DEFAULT 0,
    cancel_count INTEGER NOT NULL DEFAULT 0,
    working_days INTEGER NOT NULL DEFAULT 0,
    gross_amount INTEGER NOT NULL DEFAULT 0,
    option_deduction INTEGER NOT NULL DEFAULT 0,
    cancel_penalty INTEGER NOT NULL DEFAULT 0,
    transfer_fee INTEGER NOT NULL DEFAULT 220,
    net_amount INTEGER NOT NULL DEFAULT 0,
    cancel_rate_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
    html_content TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(sales_rep_id, period_year, period_month)
  )`,
  `ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "payment_notifications_admin" ON public.payment_notifications`,
  `CREATE POLICY "payment_notifications_admin" ON public.payment_notifications FOR ALL USING (
    EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  )`,
]

// Supabase REST APIでrpcを使ってSQL実行（pg不要）
async function execSqlViaRest(sql: string) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_migration`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({ sql_text: sql }),
  })
  return res
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-migrate-token')
  if (auth !== 'origin-migrate-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // まず exec_migration 関数を作成するSQL（bootstrap）
  const createFnSql = `
    CREATE OR REPLACE FUNCTION public.exec_migration(sql_text TEXT)
    RETURNS TEXT
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_text;
      RETURN 'ok';
    END;
    $$;
  `

  // pg パッケージで接続して関数を作成
  const { Client } = (await import('pg')).default
  
  const connectionStrings = [
    `postgresql://postgres:Ryohei1203-@canrmwyzyzawrjkomsra.supabase.co:5432/postgres?sslmode=require`,
    process.env.DATABASE_URL,
  ].filter(Boolean)

  let client: InstanceType<typeof Client> | null = null
  let connError = ''

  for (const cs of connectionStrings) {
    const c = new Client({ connectionString: cs as string, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 })
    try {
      await c.connect()
      client = c
      break
    } catch (e) {
      connError = String(e)
    }
  }

  if (!client) {
    // 関数作成不可 → REST経由で試みる（既に関数がある場合）
    const results: string[] = []
    for (const sql of SQL_STATEMENTS) {
      const res = await execSqlViaRest(sql)
      const body = await res.text()
      results.push(`${res.status}: ${body.slice(0, 100)}`)
    }
    return NextResponse.json({ error: `pg connect failed: ${connError}`, rest_attempts: results })
  }

  try {
    // 関数を作成してからSQL実行
    await client.query(createFnSql)
    const done: string[] = []
    for (const sql of SQL_STATEMENTS) {
      await client.query(sql)
      done.push(sql.slice(0, 60).trim())
    }
    await client.end()
    return NextResponse.json({ ok: true, executed: done.length })
  } catch (err) {
    await client.end().catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
