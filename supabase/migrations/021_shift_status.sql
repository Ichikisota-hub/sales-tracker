-- シフトステータスカラムを追加（提出済み/承認済み/却下）
ALTER TABLE work_schedules
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'submitted'
  CHECK (status IN ('submitted', 'approved', 'rejected'));

-- statusのインデックス
CREATE INDEX IF NOT EXISTS work_schedules_status_idx ON work_schedules(status);
