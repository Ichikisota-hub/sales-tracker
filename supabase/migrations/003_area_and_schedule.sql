-- daily_recordsにエリア列を追加
ALTER TABLE daily_records
  ADD COLUMN IF NOT EXISTS area_pref text DEFAULT '',
  ADD COLUMN IF NOT EXISTS area_city text DEFAULT '';

-- 稼働予定テーブル（work_schedule）
-- 担当者×日付ごとの計画稼働状態を管理
CREATE TABLE IF NOT EXISTS work_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_rep_id uuid REFERENCES sales_reps(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  work_status text NOT NULL DEFAULT '稼働',
  area_pref text DEFAULT '',
  area_city text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sales_rep_id, schedule_date)
);

-- RLS
ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "work_schedules_all" ON work_schedules FOR ALL USING (true);
