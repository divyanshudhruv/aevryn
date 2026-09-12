-- Remove system groups (single-user locked decision):
-- first login shows an EMPTY group list; groups are created only by the user.
-- Rewrites handle_new_user added in 20260911130000_supabase_glue.sql and
-- rewritten in 20260912120000_remove_members_invites_shares.sql: it now
-- creates ONLY the Personal workspace + user_profiles row. Any legacy
-- PERSONAL/SITE/WORKFLOWS/INVITES system groups are deleted.
-- Run AFTER drizzle migration 0005 (drops groups.kind + the kind-based
-- triggers/policies it owns are forward-fixed here too).
--
-- Data policy (locked): hard-delete everything that lived in system groups.
-- Never resurrect old-shaped data.

-- Data policy: system groups are removed but user data survives — threads
-- keep living with group_id = NULL (FK is ON DELETE SET NULL), still visible
-- in the workspace.
--
-- Order-independent: the drizzle migration may have already dropped the
-- `kind` column, so system groups are detected by name — exactly the four
-- legacy names handle_new_user ever created (case-insensitive match).

DELETE FROM "public"."groups"
WHERE lower("name") IN ('personal', 'site', 'workflows', 'invites');

-- ─────────────────────────────────────────────────────────────────────
-- 2. Drop the system-group protection (no system groups exist anymore)
-- ─────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS "prevent_system_group_delete" ON "public"."groups";
DROP FUNCTION IF EXISTS "public"."prevent_system_group_delete"();

-- ─────────────────────────────────────────────────────────────────────
-- 3. Group limit: count ALL groups (only user-created groups exist now)
-- ─────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS "enforce_group_limit" ON "public"."groups";
DROP FUNCTION IF EXISTS "public"."enforce_group_limit"();

CREATE FUNCTION "public"."enforce_group_limit"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM "public"."groups" g
    WHERE g."workspace_id" = NEW."workspace_id"
  ) >= 3 THEN
    RAISE EXCEPTION 'Group limit reached: max 3 groups per workspace (free plan)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "enforce_group_limit"
  BEFORE INSERT ON "public"."groups"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_group_limit"();

-- ─────────────────────────────────────────────────────────────────────
-- 4. handle_new_user: Personal workspace + profile ONLY (no groups)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id text;
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

  -- NO groups auto-created: the group list starts empty; first login shows
  -- "Create a new group to start building."
  RETURN NEW;
END;
$$;
