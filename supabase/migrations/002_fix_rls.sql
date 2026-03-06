-- RLSポリシーを修正: INSERT/UPDATEにWITH CHECKを追加
-- 既存ポリシーを削除して再作成

DROP POLICY IF EXISTS "Allow all" ON sales_reps;
DROP POLICY IF EXISTS "Allow all" ON monthly_plans;
DROP POLICY IF EXISTS "Allow all" ON daily_records;

CREATE POLICY "Allow all" ON sales_reps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON monthly_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON daily_records FOR ALL USING (true) WITH CHECK (true);
