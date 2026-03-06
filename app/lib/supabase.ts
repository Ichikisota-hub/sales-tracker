import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type SalesRep = {
  id: string
  name: string
  display_order: number
  created_at: string
}

export type MonthlyPlan = {
  id: string
  sales_rep_id: string
  year_month: string
  plan_cases: number
  plan_working_days: number
  updated_at: string
}

export type DailyRecord = {
  id: string
  sales_rep_id: string
  record_date: string
  acquired_cases: number
  work_status: string
  attendance_status: string
  working_hours: number
  visits: number
  net_meetings: number
  owner_meetings: number
  negotiations: number
  acquisitions: number
  updated_at: string
}
