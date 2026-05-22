
CREATE TABLE IF NOT EXISTS line_bank_sessions (
  line_user_id         TEXT PRIMARY KEY,
  step                 INTEGER NOT NULL DEFAULT 0,
  temp_bank_name       TEXT,
  temp_bank_branch     TEXT,
  temp_account_type    TEXT,
  temp_account_number  TEXT,
  temp_account_holder  TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
