CREATE TABLE IF NOT EXISTS funnel_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID NOT NULL REFERENCES sales_reps(id) ON DELETE CASCADE,
  year_month  TEXT NOT NULL,
  metric_key  TEXT NOT NULL,
  comment     TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sales_rep_id, year_month, metric_key)
);

ALTER TABLE funnel_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON funnel_comments FOR ALL USING (true);
