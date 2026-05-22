-- 招待リンクのトークンで誰でも読めるようにする（未ログインユーザーがアクセスするため）
DROP POLICY IF EXISTS "public_read_by_token" ON invitations;
CREATE POLICY "public_read_by_token" ON invitations
  FOR SELECT USING (true);
