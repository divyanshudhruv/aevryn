-- Supabase glue for the rebuilt Aevryn schema (single-user).
-- Tables, enums, indexes, FKs and RLS policies are managed by the
-- Drizzle migration (src/migrations/0000_*). This file only holds
-- what Drizzle cannot express: auth trigger, storage, realtime.
-- Run AFTER the drizzle migration has been applied.

-- ─────────────────────────────────────────────────────────────────────
-- ORACLE TRIGGER: on_auth_user_created
-- Creates a default "Personal" workspace + user profile on signup.
-- No system groups, no memberships: single-user model.
-- ─────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id text;
BEGIN
  -- Default workspace
  ws_id := 'wp_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "public"."workspaces" ("id", "name", "created_by", "is_default")
  VALUES (ws_id, 'Personal', NEW.id, true);

  -- Profile
  INSERT INTO "public"."user_profiles" ("id", "user_id")
  VALUES ('prf_' || replace(gen_random_uuid()::text, '-', ''), NEW.id);

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
-- REALTIME: tables the UI subscribes to
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages', 'run_activities', 'approval_requests', 'notifications', 'threads', 'runs'] LOOP
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
