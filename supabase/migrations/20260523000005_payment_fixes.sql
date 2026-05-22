-- 1. ヘルパー関数（get_my_organization_id）が未定義の場合に備えて作成
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
    FROM public.organization_members
   WHERE user_id = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
    FROM public.organization_members
   WHERE user_id = auth.uid()
   LIMIT 1;
$$;

-- 2. RLS修正: payment_notificationsを自組織のrepsのみに制限
DROP POLICY IF EXISTS "payment_notifications_admin" ON public.payment_notifications;
CREATE POLICY "payment_notifications_admin" ON public.payment_notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sales_reps sr
      WHERE sr.id = payment_notifications.sales_rep_id
        AND sr.organization_id = public.get_my_organization_id()
    )
    AND public.get_my_role() IN ('admin','manager')
  );

-- 3. payment_notificationsにview_tokenを追加（LINE直接表示用）
ALTER TABLE public.payment_notifications
  ADD COLUMN IF NOT EXISTS view_token TEXT UNIQUE;
UPDATE public.payment_notifications
  SET view_token = gen_random_uuid()::text
  WHERE view_token IS NULL;
ALTER TABLE public.payment_notifications
  ALTER COLUMN view_token SET DEFAULT gen_random_uuid()::text;

-- 4. teamsにleader_rep_idを追加（チームリーダーボーナス用）
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS leader_rep_id UUID REFERENCES public.sales_reps(id) ON DELETE SET NULL;
