-- RLS の無限再帰を修正
-- organization_members を参照するポリシーが自己参照して再帰するため
-- SECURITY DEFINER 関数経由でアクセスすることで回避する

-- ========== ヘルパー関数 ==========

-- ユーザーの organization_id を RLS をバイパスして取得
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
    FROM public.organization_members
   WHERE user_id = auth.uid()
   LIMIT 1;
$$;

-- ユーザーのロールを RLS をバイパスして取得
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
    FROM public.organization_members
   WHERE user_id = auth.uid()
   LIMIT 1;
$$;

-- ========== organizations ==========

DROP POLICY IF EXISTS "members_select_org" ON organizations;
CREATE POLICY "members_select_org" ON organizations FOR SELECT
  USING (id = public.get_my_organization_id());

DROP POLICY IF EXISTS "admin_update_org" ON organizations;
CREATE POLICY "admin_update_org" ON organizations FOR UPDATE
  USING (id = public.get_my_organization_id()
    AND public.get_my_role() = 'admin');

-- ========== organization_members ==========

DROP POLICY IF EXISTS "members_select_members" ON organization_members;
CREATE POLICY "members_select_members" ON organization_members FOR SELECT
  USING (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "admin_manage_members" ON organization_members;
CREATE POLICY "admin_manage_members" ON organization_members FOR ALL
  USING (organization_id = public.get_my_organization_id()
    AND public.get_my_role() IN ('admin', 'manager'))
  WITH CHECK (organization_id = public.get_my_organization_id()
    AND public.get_my_role() IN ('admin', 'manager'));

-- ========== invitations ==========

DROP POLICY IF EXISTS "admin_manage_invitations" ON invitations;
CREATE POLICY "admin_manage_invitations" ON invitations FOR ALL
  USING (organization_id = public.get_my_organization_id()
    AND public.get_my_role() IN ('admin', 'manager'))
  WITH CHECK (organization_id = public.get_my_organization_id()
    AND public.get_my_role() IN ('admin', 'manager'));

-- ========== 既存テーブルの RLS を JWT クレームからヘルパー関数に変更 ==========
-- JWT hook なしでも動作するよう get_my_organization_id() を使用

DROP POLICY IF EXISTS "org_select_sales_reps" ON sales_reps;
CREATE POLICY "org_select_sales_reps" ON sales_reps FOR SELECT
  USING (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "org_admin_insert_sales_reps" ON sales_reps;
DROP POLICY IF EXISTS "org_admin_update_sales_reps" ON sales_reps;
DROP POLICY IF EXISTS "org_admin_delete_sales_reps" ON sales_reps;
CREATE POLICY "org_write_sales_reps" ON sales_reps FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "org_select_teams" ON teams;
DROP POLICY IF EXISTS "org_admin_write_teams" ON teams;
CREATE POLICY "org_select_teams" ON teams FOR SELECT
  USING (organization_id = public.get_my_organization_id());
CREATE POLICY "org_write_teams" ON teams FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "org_select_monthly_plans" ON monthly_plans;
DROP POLICY IF EXISTS "org_write_monthly_plans" ON monthly_plans;
CREATE POLICY "org_select_monthly_plans" ON monthly_plans FOR SELECT
  USING (organization_id = public.get_my_organization_id());
CREATE POLICY "org_write_monthly_plans" ON monthly_plans FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "org_select_daily_records" ON daily_records;
DROP POLICY IF EXISTS "org_write_daily_records" ON daily_records;
CREATE POLICY "org_select_daily_records" ON daily_records FOR SELECT
  USING (organization_id = public.get_my_organization_id());
CREATE POLICY "org_write_daily_records" ON daily_records FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "org_select_contracts" ON contracts;
DROP POLICY IF EXISTS "org_write_contracts" ON contracts;
CREATE POLICY "org_select_contracts" ON contracts FOR SELECT
  USING (organization_id = public.get_my_organization_id());
CREATE POLICY "org_write_contracts" ON contracts FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "org_select_work_schedules" ON work_schedules;
DROP POLICY IF EXISTS "org_write_work_schedules" ON work_schedules;
CREATE POLICY "org_select_work_schedules" ON work_schedules FOR SELECT
  USING (organization_id = public.get_my_organization_id());
CREATE POLICY "org_write_work_schedules" ON work_schedules FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

DROP POLICY IF EXISTS "org_select_daily_reports" ON daily_reports;
DROP POLICY IF EXISTS "org_write_daily_reports" ON daily_reports;
CREATE POLICY "org_select_daily_reports" ON daily_reports FOR SELECT
  USING (organization_id = public.get_my_organization_id());
CREATE POLICY "org_write_daily_reports" ON daily_reports FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

-- トリガーも get_my_organization_id() を使うよう更新
CREATE OR REPLACE FUNCTION public.auto_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_my_organization_id();
  END IF;
  RETURN NEW;
END;
$$;
