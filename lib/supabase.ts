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
  work_time_start: string
  work_time_end: string
  visits: number
  net_meetings: number
  owner_meetings: number
  negotiations: number
  acquisitions: number
  area_pref: string
  area_city: string
  area_list: { pref: string; city: string }[]
  updated_at: string
}

export type WorkSchedule = {
  id: string
  sales_rep_id: string
  schedule_date: string
  work_status: string
  work_time_start: string
  work_time_end: string
  working_hours: number
  area_pref: string
  area_city: string
  updated_at: string
}

export type Contract = {
  id: string
  sales_rep_id: string
  customer_name: string
  phone: string
  address: string
  area_pref: string
  area_city: string
  wifi_provider: string
  wifi_provider_other: string
  acquired_date: string
  construction_date: string | null
  construction_called: boolean
  status: string
  notes: string
  created_at: string
  updated_at: string
}
