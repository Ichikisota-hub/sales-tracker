-- 既存の "Allow all" ポリシーを削除して組織ベースの RLS に刷新
-- JWT クレームの organization_id を使用してフィルタリング

-- ========== sales_reps ==========
DROP POLICY IF EXISTS "Allow all" ON sales_reps;

CREATE POLICY "org_select_sales_reps" ON sales_reps FOR SELECT
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid);

CREATE POLICY "org_admin_insert_sales_reps" ON sales_reps FOR INSERT
  WITH CHECK (organization_id = (auth.jwt()->>'organization_id')::uuid
    AND (auth.jwt()->>'user_role') IN ('admin', 'manager'));

CREATE POLICY "org_admin_update_sales_reps" ON sales_reps FOR UPDATE
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid
    AND (auth.jwt()->>'user_role') IN ('admin', 'manager'));

CREATE POLICY "org_admin_delete_sales_reps" ON sales_reps FOR DELETE
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid
    AND (auth.jwt()->>'user_role') IN ('admin', 'manager'));

-- ========== teams ==========
DROP POLICY IF EXISTS "Allow all" ON teams;

CREATE POLICY "org_select_teams" ON teams FOR SELECT
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid);

CREATE POLICY "org_admin_write_teams" ON teams FOR ALL
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid
    AND (auth.jwt()->>'user_role') IN ('admin', 'manager'))
  WITH CHECK (organization_id = (auth.jwt()->>'organization_id')::uuid
    AND (auth.jwt()->>'user_role') IN ('admin', 'manager'));

-- ========== monthly_plans ==========
DROP POLICY IF EXISTS "Allow all" ON monthly_plans;

CREATE POLICY "org_select_monthly_plans" ON monthly_plans FOR SELECT
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid);

CREATE POLICY "org_write_monthly_plans" ON monthly_plans FOR ALL
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt()->>'organization_id')::uuid);

-- ========== daily_records ==========
DROP POLICY IF EXISTS "Allow all" ON daily_records;

CREATE POLICY "org_select_daily_records" ON daily_records FOR SELECT
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid);

CREATE POLICY "org_write_daily_records" ON daily_records FOR ALL
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt()->>'organization_id')::uuid);

-- ========== contracts ==========
DROP POLICY IF EXISTS "Allow all" ON contracts;

CREATE POLICY "org_select_contracts" ON contracts FOR SELECT
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid);

CREATE POLICY "org_write_contracts" ON contracts FOR ALL
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt()->>'organization_id')::uuid);

-- ========== work_schedules ==========
DROP POLICY IF EXISTS "Allow all" ON work_schedules;

CREATE POLICY "org_select_work_schedules" ON work_schedules FOR SELECT
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid);

CREATE POLICY "org_write_work_schedules" ON work_schedules FOR ALL
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt()->>'organization_id')::uuid);

-- ========== daily_reports ==========
DROP POLICY IF EXISTS "Allow all" ON daily_reports;

CREATE POLICY "org_select_daily_reports" ON daily_reports FOR SELECT
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid);

CREATE POLICY "org_write_daily_reports" ON daily_reports FOR ALL
  USING (organization_id = (auth.jwt()->>'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt()->>'organization_id')::uuid);
