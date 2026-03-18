-- 認証なし運用に戻すため RLS を全許可に変更

DO $$ DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'sales_reps','teams','monthly_plans','daily_records',
    'contracts','work_schedules','daily_reports',
    'organizations','organization_members','invitations'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org_select_%s" ON %s', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "org_write_%s" ON %s', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "org_admin_insert_%s" ON %s', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "org_admin_update_%s" ON %s', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "org_admin_delete_%s" ON %s', tbl, tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "org_write_sales_reps"       ON sales_reps;
DROP POLICY IF EXISTS "org_select_sales_reps"      ON sales_reps;
DROP POLICY IF EXISTS "members_select_members"     ON organization_members;
DROP POLICY IF EXISTS "admin_manage_members"       ON organization_members;
DROP POLICY IF EXISTS "members_select_org"         ON organizations;
DROP POLICY IF EXISTS "admin_update_org"           ON organizations;
DROP POLICY IF EXISTS "admin_manage_invitations"   ON invitations;
DROP POLICY IF EXISTS "public_select_invitation_by_token" ON invitations;

-- 全テーブルに Allow all ポリシーを再設定
CREATE POLICY "Allow all" ON sales_reps     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON teams          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON monthly_plans  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON daily_records  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contracts      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON work_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON daily_reports  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON organizations  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON organization_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON invitations    FOR ALL USING (true) WITH CHECK (true);
