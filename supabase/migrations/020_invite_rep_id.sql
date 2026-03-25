ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS rep_id UUID REFERENCES sales_reps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_rep_id ON invitations(rep_id);
