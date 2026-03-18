-- JWT カスタムクレーム用 Database Function
-- Supabase Dashboard > Authentication > Hooks > custom_access_token に登録すること

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_org_id uuid;
  user_role text;
BEGIN
  claims := event->'claims';

  -- organization_members から当該ユーザーの組織 ID とロールを取得
  SELECT om.organization_id, om.role
    INTO user_org_id, user_role
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
   WHERE om.user_id = (event->>'user_id')::uuid
     AND o.is_active = true
   LIMIT 1;

  IF user_org_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{organization_id}', to_jsonb(user_org_id::text));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Hook 関数に必要なパーミッション付与
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ========== INSERT 時に organization_id を JWT から自動セットするトリガー ==========

CREATE OR REPLACE FUNCTION public.auto_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    org_id := (auth.jwt()->>'organization_id')::uuid;
    NEW.organization_id := org_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 各テーブルにトリガーを適用
CREATE TRIGGER trg_sales_reps_set_org
  BEFORE INSERT ON public.sales_reps
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_teams_set_org
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_monthly_plans_set_org
  BEFORE INSERT ON public.monthly_plans
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_daily_records_set_org
  BEFORE INSERT ON public.daily_records
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_contracts_set_org
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_work_schedules_set_org
  BEFORE INSERT ON public.work_schedules
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

CREATE TRIGGER trg_daily_reports_set_org
  BEFORE INSERT ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_organization_id();

-- ========== メンバー上限チェックトリガー ==========

CREATE OR REPLACE FUNCTION public.check_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count integer;
  max_allowed   integer;
BEGIN
  SELECT COUNT(*), o.max_members
    INTO current_count, max_allowed
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
   WHERE om.organization_id = NEW.organization_id
   GROUP BY o.max_members;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'メンバー上限（%名）に達しています。プランをアップグレードしてください。', max_allowed;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_member_limit
  BEFORE INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.check_member_limit();
