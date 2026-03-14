-- 契約宅テーブル
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID REFERENCES sales_reps(id) ON DELETE CASCADE,

  -- 顧客情報
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  area_pref TEXT DEFAULT '',
  area_city TEXT DEFAULT '',

  -- 利用WiFi
  wifi_provider TEXT DEFAULT '',       -- 選択肢 or 'その他'
  wifi_provider_other TEXT DEFAULT '', -- 「その他」の場合の記入

  -- 獲得日（自動）
  acquired_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- 工事情報
  construction_date DATE,              -- 工事日（任意入力）
  construction_called BOOLEAN DEFAULT FALSE, -- 工事日電話済み

  -- ステータス
  status TEXT DEFAULT '手続き中',      -- キャンセル/手続き中/工事日決定/開通

  -- メモ
  notes TEXT DEFAULT '',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts_all" ON contracts FOR ALL USING (true);
