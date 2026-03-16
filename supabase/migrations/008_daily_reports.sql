CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_rep_id uuid REFERENCES sales_reps(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  acquisition_case text DEFAULT '',
  lost_case text DEFAULT '',
  remaining_work text DEFAULT '',
  good_points text DEFAULT '',
  issues text DEFAULT '',
  improvements text DEFAULT '',
  learnings text DEFAULT '',
  gratitude text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sales_rep_id, report_date)
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON daily_reports FOR ALL USING (true) WITH CHECK (true);
