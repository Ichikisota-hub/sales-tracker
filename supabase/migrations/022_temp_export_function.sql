-- 一時的なエクスポート関数（移行後に削除）
CREATE OR REPLACE FUNCTION public.export_auth_users_for_migration()
RETURNS TABLE(
  id UUID,
  email TEXT,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  raw_app_meta_data JSONB,
  raw_user_meta_data JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at
  FROM auth.users
  WHERE is_anonymous = false
    AND deleted_at IS NULL;
$$;
