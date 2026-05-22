ALTER TABLE daily_records
  ADD COLUMN IF NOT EXISTS acquisition_case  TEXT,
  ADD COLUMN IF NOT EXISTS lost_case         TEXT,
  ADD COLUMN IF NOT EXISTS remaining_work    TEXT,
  ADD COLUMN IF NOT EXISTS good_points       TEXT,
  ADD COLUMN IF NOT EXISTS issues            TEXT,
  ADD COLUMN IF NOT EXISTS improvements      TEXT,
  ADD COLUMN IF NOT EXISTS learnings         TEXT,
  ADD COLUMN IF NOT EXISTS gratitude         TEXT;
