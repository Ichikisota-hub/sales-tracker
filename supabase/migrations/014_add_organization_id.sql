-- 既存テーブルに organization_id カラムを追加
ALTER TABLE sales_reps     ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE teams          ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE monthly_plans  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE daily_records  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE contracts      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE daily_reports  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- インデックス（組織フィルタの高速化）
CREATE INDEX IF NOT EXISTS idx_sales_reps_org     ON sales_reps(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_org          ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_records_org  ON daily_records(organization_id, record_date);
CREATE INDEX IF NOT EXISTS idx_contracts_org      ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_org  ON monthly_plans(organization_id, year_month);
CREATE INDEX IF NOT EXISTS idx_work_schedules_org ON work_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_org  ON daily_reports(organization_id, report_date);
