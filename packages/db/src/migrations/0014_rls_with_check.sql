-- RLS hardening (written against LIVE policy state, which has drifted from
-- earlier migration files):
--
-- 1. groups/threads/user_profiles/workspaces: UPDATE policies already gate
--    rows via USING, but had no WITH CHECK — a user could reassign
--    user_id/created_by on their own row. Add WITH CHECK.
--
-- 2. messages/plan_steps/steps/user_keys/user_providers/user_settings/
--    workflows: ALL policies (select/insert/update/delete) were unscoped —
--    any authenticated user could read (including other users' ENCRYPTED
--    API KEYS), update, and delete any other user's rows via the Data API.
--    Recreate every policy scoped to the row owner, matching the pattern of
--    the correctly-scoped tables.
--
-- tool_call_logs has NO policies live (RLS default-deny = secure); its
-- policies come from migration 0010 on fresh replays. Left untouched here —
-- its user_id column is text, so the uuid comparison below doesn't apply.
--> statement-breakpoint

-- ── 1. Add WITH CHECK to already-scoped UPDATE policies ──
ALTER POLICY "groups_update" ON "groups" WITH CHECK ("groups"."user_id" = auth.uid());--> statement-breakpoint
ALTER POLICY "threads_update" ON "threads" WITH CHECK ("threads"."user_id" = auth.uid());--> statement-breakpoint
ALTER POLICY "user_profiles_update" ON "user_profiles" WITH CHECK ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
ALTER POLICY "workspaces_update" ON "workspaces" WITH CHECK ("workspaces"."created_by" = auth.uid());--> statement-breakpoint

-- ── 2. Recreate unscoped policies, owner-scoped ──
DROP POLICY "messages_select" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_select" ON "messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("messages"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "messages_insert" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_insert" ON "messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("messages"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "messages_update" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_update" ON "messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("messages"."user_id" = auth.uid()) WITH CHECK ("messages"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "messages_delete" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_delete" ON "messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("messages"."user_id" = auth.uid());--> statement-breakpoint

DROP POLICY "plan_steps_select" ON "plan_steps";--> statement-breakpoint
CREATE POLICY "plan_steps_select" ON "plan_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "plan_steps_insert" ON "plan_steps";--> statement-breakpoint
CREATE POLICY "plan_steps_insert" ON "plan_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "plan_steps_update" ON "plan_steps";--> statement-breakpoint
CREATE POLICY "plan_steps_update" ON "plan_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("plan_steps"."user_id" = auth.uid()) WITH CHECK ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "plan_steps_delete" ON "plan_steps";--> statement-breakpoint
CREATE POLICY "plan_steps_delete" ON "plan_steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint

DROP POLICY "steps_select" ON "steps";--> statement-breakpoint
CREATE POLICY "steps_select" ON "steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("steps"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "steps_insert" ON "steps";--> statement-breakpoint
CREATE POLICY "steps_insert" ON "steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("steps"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "steps_update" ON "steps";--> statement-breakpoint
CREATE POLICY "steps_update" ON "steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("steps"."user_id" = auth.uid()) WITH CHECK ("steps"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "steps_delete" ON "steps";--> statement-breakpoint
CREATE POLICY "steps_delete" ON "steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("steps"."user_id" = auth.uid());--> statement-breakpoint

DROP POLICY "user_keys_select" ON "user_keys";--> statement-breakpoint
CREATE POLICY "user_keys_select" ON "user_keys" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_keys"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_keys_insert" ON "user_keys";--> statement-breakpoint
CREATE POLICY "user_keys_insert" ON "user_keys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_keys"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_keys_update" ON "user_keys";--> statement-breakpoint
CREATE POLICY "user_keys_update" ON "user_keys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_keys"."user_id" = auth.uid()) WITH CHECK ("user_keys"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_keys_delete" ON "user_keys";--> statement-breakpoint
CREATE POLICY "user_keys_delete" ON "user_keys" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_keys"."user_id" = auth.uid());--> statement-breakpoint

DROP POLICY "user_providers_select" ON "user_providers";--> statement-breakpoint
CREATE POLICY "user_providers_select" ON "user_providers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_providers"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_providers_insert" ON "user_providers";--> statement-breakpoint
CREATE POLICY "user_providers_insert" ON "user_providers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_providers"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_providers_update" ON "user_providers";--> statement-breakpoint
CREATE POLICY "user_providers_update" ON "user_providers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_providers"."user_id" = auth.uid()) WITH CHECK ("user_providers"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_providers_delete" ON "user_providers";--> statement-breakpoint
CREATE POLICY "user_providers_delete" ON "user_providers" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_providers"."user_id" = auth.uid());--> statement-breakpoint

DROP POLICY "user_settings_select" ON "user_settings";--> statement-breakpoint
CREATE POLICY "user_settings_select" ON "user_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_settings"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_settings_insert" ON "user_settings";--> statement-breakpoint
CREATE POLICY "user_settings_insert" ON "user_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_settings"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_settings_update" ON "user_settings";--> statement-breakpoint
CREATE POLICY "user_settings_update" ON "user_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_settings"."user_id" = auth.uid()) WITH CHECK ("user_settings"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "user_settings_delete" ON "user_settings";--> statement-breakpoint
CREATE POLICY "user_settings_delete" ON "user_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_settings"."user_id" = auth.uid());--> statement-breakpoint

DROP POLICY "workflows_select" ON "workflows";--> statement-breakpoint
CREATE POLICY "workflows_select" ON "workflows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "workflows_insert" ON "workflows";--> statement-breakpoint
CREATE POLICY "workflows_insert" ON "workflows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("workflows"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "workflows_update" ON "workflows";--> statement-breakpoint
CREATE POLICY "workflows_update" ON "workflows" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("workflows"."user_id" = auth.uid()) WITH CHECK ("workflows"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY "workflows_delete" ON "workflows";--> statement-breakpoint
CREATE POLICY "workflows_delete" ON "workflows" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("workflows"."user_id" = auth.uid());
