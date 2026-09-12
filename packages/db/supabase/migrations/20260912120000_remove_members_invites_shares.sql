-- Single-user cleanup: remove membership / invite / sharing entirely.
--
-- Drops workspace_members, invites, thread_shares and their enum types,
-- rewrites the drizzle-managed policies that referenced members (the policy
-- rewrite itself is in src/migrations/0004_open_jean_grey.sql — run that
-- migration first), and rewrites the supabase glue function/RPC added in
-- 20260911130000_supabase_glue.sql so nothing touches the dropped tables.
--
-- Run AFTER applying "0004_open_jean_grey". Leave the earlier raw-SQL
-- migrations untouched; this file is the forward-fix.

-- ─────────────────────────────────────────────────────────────────────
-- handle_new_user: single-owner workspace, no membership row, no INVITES group
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id text;
  grp_personal text;
  grp_site text;
  grp_workflows text;
  prf_id text;
BEGIN
  -- Create Personal workspace (is_default)
  ws_id := 'wp_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."workspaces" ("id", "name", "created_by", "is_default")
  VALUES (ws_id, 'Personal', NEW.id, true);

  -- Create profile
  prf_id := 'prf_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."user_profiles" ("id", "user_id")
  VALUES (prf_id, NEW.id);

  -- Create system groups
  grp_personal := 'grp_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."groups" ("id", "workspace_id", "user_id", "name", "kind", "position")
  VALUES (grp_personal, ws_id, NEW.id, 'PERSONAL', 'system', 0);

  grp_site := 'grp_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."groups" ("id", "workspace_id", "user_id", "name", "kind", "position")
  VALUES (grp_site, ws_id, NEW.id, 'SITE', 'system', 1);

  grp_workflows := 'grp_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."groups" ("id", "workspace_id", "user_id", "name", "kind", "position")
  VALUES (grp_workflows, ws_id, NEW.id, 'WORKFLOWS', 'system', 2);

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- get_workspace_key: owner-only access check (drop membership branch)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."get_workspace_key"(
  "p_workspace_id" text,
  "p_provider" "public"."api_provider"
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Validate caller owns the workspace
  IF NOT (
    EXISTS (SELECT 1 FROM "public"."workspaces" w WHERE w."id" = "p_workspace_id" AND w."created_by" = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'id', wk."id",
    'provider', wk."provider",
    'model_name', wk."model_name",
    'created_at', wk."created_at"
  ) INTO result
  FROM "public"."workspace_api_keys" wk
  WHERE wk."workspace_id" = "p_workspace_id" AND wk."provider" = "p_provider";

  RETURN result;
END;
$$;