import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 後方互換のためシングルトンエクスポートを維持
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// ========== 型定義 ==========

export type Organization = {
  id: string
  name: string
  slug: string
  plan: string
  trial_ends_at: string | null
  max_members: number
  is_active: boolean
  settings: {
    google_sheet_id?: string
    [key: string]: unknown
  }
  created_at: string
}

export type OrganizationMember = {
  id: string
  organization_id: string
  user_id: string
  role: 'admin' | 'manager' | 'member'
  sales_rep_id: string | null
  joined_at: string
}

export type Invitation = {
  id: string
  organization_id: string
  email: string
  role: 'admin' | 'manager' | 'member'
  token: string
  expires_at: string
  accepted_at: string | null
  invited_by: string | null
  created_at: string
}

export type Team = {
  id: string
  name: string
  display_order: number
  organization_id: string | null
  created_at: string
}

export type SalesRep = {
  id: string
  name: string
  display_order: number
  team_id: string | null
  is_active: boolean
  organization_id: string | null
  created_at: string
}

export type MonthlyPlan = {
  id: string
  sales_rep_id: string
  year_month: string
  plan_cases: number
  plan_working_days: number
  organization_id: string | null
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
  organization_id: string | null
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
  organization_id: string | null
  updated_at: string
}

export type DailyReport = {
  id: string
  sales_rep_id: string
  report_date: string
  acquisition_case: string
  lost_case: string
  remaining_work: string
  good_points: string
  issues: string
  improvements: string
  learnings: string
  gratitude: string
  visits: number
  net_meetings: number
  owner_meetings: number
  negotiations: number
  acquisitions: number
  organization_id: string | null
  created_at: string
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
  option_removed: boolean
  landline_removed: boolean
  router_removed: boolean
  needs_option_removal: boolean
  needs_landline_removal: boolean
  needs_router_removal: boolean
  notes: string
  organization_id: string | null
  created_at: string
  updated_at: string
}
