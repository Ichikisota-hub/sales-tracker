-- daily_recordsに稼働時間帯カラムを追加
ALTER TABLE daily_records
  ADD COLUMN IF NOT EXISTS work_time_start text DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_time_end text DEFAULT '';
