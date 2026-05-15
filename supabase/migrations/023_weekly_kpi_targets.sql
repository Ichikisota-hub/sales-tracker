-- 週間KPI目標テーブル
CREATE TABLE IF NOT EXISTS weekly_kpi_targets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_rep_id uuid REFERENCES sales_reps(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  week_index integer NOT NULL,  -- 0始まり（第1週=0, 第2週=1...）
  target integer NOT NULL DEFAULT 0,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sales_rep_id, year_month, week_index)
);

ALTER TABLE weekly_kpi_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON weekly_kpi_targets FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_weekly_kpi_targets_rep_month
  ON weekly_kpi_targets(sales_rep_id, year_month);
