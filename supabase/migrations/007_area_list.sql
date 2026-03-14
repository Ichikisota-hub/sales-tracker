-- daily_recordsに複数エリア対応カラムを追加
ALTER TABLE daily_records
  ADD COLUMN IF NOT EXISTS area_list jsonb DEFAULT '[]'::jsonb;
