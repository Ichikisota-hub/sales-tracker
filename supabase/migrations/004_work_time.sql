-- work_schedulesに稼働時間帯カラムを追加
ALTER TABLE work_schedules
  ADD COLUMN IF NOT EXISTS work_time_start text DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_time_end text DEFAULT '';
