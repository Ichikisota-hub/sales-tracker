-- work_schedulesに稼働時間カラムを追加
ALTER TABLE work_schedules
  ADD COLUMN IF NOT EXISTS working_hours numeric DEFAULT 0;
