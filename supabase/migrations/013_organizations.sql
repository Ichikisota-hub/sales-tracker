-- organizations テーブル（組織マスター）
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  max_members     INTEGER NOT NULL DEFAULT 20,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  settings        JSONB DEFAULT '{}'::jsonb,  -- google_sheet_id 等を格納
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- organization_members テーブル（ユーザー↔組織の紐付け）
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',  -- admin / manager / member
  sales_rep_id    UUID REFERENCES sales_reps(id) ON DELETE SET NULL,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- invitations テーブル（招待トークン）
CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  token           TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at     TIMESTAMPTZ,
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org  ON organization_members(organization_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- RLS 有効化
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- organizations: 自分が所属する組織のみ参照可
CREATE POLICY "members_select_org" ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- organizations: admin のみ UPDATE 可
CREATE POLICY "admin_update_org" ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- organization_members: 同じ組織のメンバーのみ参照可
CREATE POLICY "members_select_members" ON organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- organization_members: admin のみ INSERT / DELETE 可（自分自身の参加は service role で実行）
CREATE POLICY "admin_manage_members" ON organization_members FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- invitations: 同じ組織の admin/manager のみ参照・作成可
CREATE POLICY "admin_manage_invitations" ON invitations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- invitations: トークンで単体参照可（招待リンククリック時に認証なしで確認するため）
CREATE POLICY "public_select_invitation_by_token" ON invitations FOR SELECT
  USING (true);
