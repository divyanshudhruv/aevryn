-- Supabase glue: everything Drizzle cannot express (triggers, RPCs,
-- Realtime publications, Storage). Tables + enums + indexes + FKs +
-- RLS policies are all managed by Drizzle migrations (0000/0001/0002).

-- ─────────────────────────────────────────────────────────────────────
-- LIMIT TRIGGERS
-- ─────────────────────────────────────────────────────────────────────

-- ≤5 threads per group (free plan)
DROP TRIGGER IF EXISTS enforce_thread_limit ON "public"."threads";
CREATE OR REPLACE FUNCTION "public"."enforce_thread_limit"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."group_id" IS NOT NULL THEN
    IF (
      SELECT count(*) FROM "public"."threads" t
      WHERE t."group_id" = NEW."group_id" AND t."deleted_at" IS NULL
    ) >= 5 THEN
      RAISE EXCEPTION 'Group limit reached: max 5 threads per group';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_thread_limit
  BEFORE INSERT ON "public"."threads"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_thread_limit"();

-- ≤3 custom groups per workspace (free plan)
DROP TRIGGER IF EXISTS enforce_group_limit ON "public"."groups";
CREATE OR REPLACE FUNCTION "public"."enforce_group_limit"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."kind" = 'custom' THEN
    IF (
      SELECT count(*) FROM "public"."groups" g
      WHERE g."workspace_id" = NEW."workspace_id" AND g."kind" = 'custom'
    ) >= 3 THEN
      RAISE EXCEPTION 'Group limit reached: max 3 custom groups per workspace (free plan)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_group_limit
  BEFORE INSERT ON "public"."groups"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_group_limit"();

-- Prevent deletion of system groups
DROP TRIGGER IF EXISTS prevent_system_group_delete ON "public"."groups";
CREATE OR REPLACE FUNCTION "public"."prevent_system_group_delete"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD."kind" = 'system' THEN
    RAISE EXCEPTION 'Cannot delete system group';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_system_group_delete
  BEFORE DELETE ON "public"."groups"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_system_group_delete"();

-- ─────────────────────────────────────────────────────────────────────
-- ORACLE TRIGGER: on_auth_user_created.
-- Supabase ships a placeholder trigger w/ the same name + handle_new_user fn;
-- ours replaces both.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
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
  grp_invites text;
  prf_id text;
  wme_id text;
BEGIN
  -- Create Personal workspace (is_default)
  ws_id := 'wp_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."workspaces" ("id", "name", "created_by", "is_default")
  VALUES (ws_id, 'Personal', NEW.id, true);

  -- Create owner membership
  wme_id := 'wme_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."workspace_members" ("id", "workspace_id", "user_id", "role")
  VALUES (wme_id, ws_id, NEW.id, 'owner');

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

  grp_invites := 'grp_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."groups" ("id", "workspace_id", "user_id", "name", "kind", "position")
  VALUES (grp_invites, ws_id, NEW.id, 'INVITES', 'system', 3);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- ─────────────────────────────────────────────────────────────────────
-- STORAGE BUCKET: chat-attachments
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "storage_select_own" ON storage.objects;
CREATE POLICY "storage_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "storage_insert_own" ON storage.objects;
CREATE POLICY "storage_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "storage_update_own" ON storage.objects;
CREATE POLICY "storage_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "storage_delete_own" ON storage.objects;
CREATE POLICY "storage_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─────────────────────────────────────────────────────────────────────
-- REALTIME: Enable publication for realtime tables
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages', 'run_activities', 'approval_requests', 'notifications'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE "public"."%I"', t);
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- RPC: get_workspace_key (security definer — decrypts server-side)
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
  -- Validate caller is owner or member
  IF NOT (
    EXISTS (SELECT 1 FROM "public"."workspaces" w WHERE w."id" = "p_workspace_id" AND w."created_by" = auth.uid())
    OR EXISTS (SELECT 1 FROM "public"."workspace_members" wm WHERE wm."workspace_id" = "p_workspace_id" AND wm."user_id" = auth.uid())
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