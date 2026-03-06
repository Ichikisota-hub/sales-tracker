-- 担当者テーブル
CREATE TABLE IF NOT EXISTS sales_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 月間計画テーブル（月初入力）
CREATE TABLE IF NOT EXISTS monthly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID REFERENCES sales_reps(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL, -- 'YYYY-MM'
  plan_cases INTEGER DEFAULT 0,          -- 月間計画件数
  plan_working_days INTEGER DEFAULT 0,   -- 月間計画稼働日数
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sales_rep_id, year_month)
);

-- 日次活動記録テーブル
CREATE TABLE IF NOT EXISTS daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID REFERENCES sales_reps(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  
  -- 件数系（①獲得件数）
  acquired_cases INTEGER DEFAULT 0,      -- 獲得件数
  
  -- 出勤状態
  work_status TEXT DEFAULT '稼働',       -- 稼働/休日/同行/etc
  attendance_status TEXT DEFAULT '稼働', -- 出勤状態
  
  -- 稼働時間
  working_hours NUMERIC(4,1) DEFAULT 0,
  
  -- 行動量（1日分）
  visits INTEGER DEFAULT 0,             -- 訪問
  net_meetings INTEGER DEFAULT 0,       -- ネット対面
  owner_meetings INTEGER DEFAULT 0,     -- 主権対面
  negotiations INTEGER DEFAULT 0,       -- 商談
  acquisitions INTEGER DEFAULT 0,       -- 獲得
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sales_rep_id, record_date)
);

-- 初期担当者データ（20名分プレースホルダー）
INSERT INTO sales_reps (name, display_order) VALUES
('担当者1', 1),('担当者2', 2),('担当者3', 3),('担当者4', 4),('担当者5', 5),
('担当者6', 6),('担当者7', 7),('担当者8', 8),('担当者9', 9),('担当者10', 10),
('担当者11', 11),('担当者12', 12),('担当者13', 13),('担当者14', 14),('担当者15', 15),
('担当者16', 16),('担当者17', 17),('担当者18', 18),('担当者19', 19),('担当者20', 20);

-- RLS ポリシー（全員読み書き可能 - 必要に応じて制限）
ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON sales_reps FOR ALL USING (true);
CREATE POLICY "Allow all" ON monthly_plans FOR ALL USING (true);
CREATE POLICY "Allow all" ON daily_records FOR ALL USING (true);
