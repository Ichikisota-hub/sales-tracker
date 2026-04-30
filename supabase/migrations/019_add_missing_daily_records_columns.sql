-- daily_records に不足しているカラムを追加
-- （マイグレーションファイルに定義されていなかったため本番DBに存在しない）
ALTER TABLE daily_records
  ADD COLUMN IF NOT EXISTS interphone_only    INTEGER DEFAULT 0,  -- インターホンのみ
  ADD COLUMN IF NOT EXISTS paper_presentation INTEGER DEFAULT 0,  -- 紙プレ
  ADD COLUMN IF NOT EXISTS full_talk          INTEGER DEFAULT 0,  -- フルトーク
  ADD COLUMN IF NOT EXISTS indoor_entry       INTEGER DEFAULT 0,  -- 宅内IN
  ADD COLUMN IF NOT EXISTS prospects          INTEGER DEFAULT 0;  -- 見込み
