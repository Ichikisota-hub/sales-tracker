-- 楽楽販売からのデータ拡張フィールド
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS cancellation_date    date,
  ADD COLUMN IF NOT EXISTS billing_start_date   date,
  ADD COLUMN IF NOT EXISTS cancellation_reason  text,
  ADD COLUMN IF NOT EXISTS entry_status         text,
  ADD COLUMN IF NOT EXISTS apply_number         text;   -- 申込書番号（重複防止キー）

CREATE INDEX IF NOT EXISTS idx_contracts_apply_number ON contracts(apply_number) WHERE apply_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
