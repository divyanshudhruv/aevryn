DROP POLICY IF EXISTS "workspace_members_select" ON "workspace_members" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_members_insert" ON "workspace_members" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_members_update" ON "workspace_members" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_members_delete" ON "workspace_members" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_members" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "invites_select" ON "invites" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "invites_insert" ON "invites" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "invites_update" ON "invites" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "invites_delete" ON "invites" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "invites" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "thread_shares_select" ON "thread_shares" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "thread_shares_insert" ON "thread_shares" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "thread_shares_delete" ON "thread_shares" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "thread_shares" CASCADE;--> statement-breakpoint
ALTER TABLE "threads" DROP COLUMN IF EXISTS "share_enabled";--> statement-breakpoint
DROP POLICY IF EXISTS "workspaces_select" ON "workspaces";--> statement-breakpoint
CREATE POLICY "workspaces_select" ON "workspaces" AS PERMISSIVE FOR SELECT TO authenticated USING ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
DROP POLICY IF EXISTS "groups_select" ON "groups";--> statement-breakpoint
DROP POLICY IF EXISTS "groups_insert" ON "groups";--> statement-breakpoint
DROP POLICY IF EXISTS "groups_update" ON "groups";--> statement-breakpoint
DROP POLICY IF EXISTS "groups_delete" ON "groups";--> statement-breakpoint
CREATE POLICY "groups_select" ON "groups" AS PERMISSIVE FOR SELECT TO authenticated USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_insert" ON "groups" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_update" ON "groups" AS PERMISSIVE FOR UPDATE TO authenticated USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_delete" ON "groups" AS PERMISSIVE FOR DELETE TO authenticated USING ("groups"."kind" = 'custom' and "groups"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY IF EXISTS "threads_select" ON "threads";--> statement-breakpoint
DROP POLICY IF EXISTS "threads_insert" ON "threads";--> statement-breakpoint
DROP POLICY IF EXISTS "threads_update" ON "threads";--> statement-breakpoint
CREATE POLICY "threads_select" ON "threads" AS PERMISSIVE FOR SELECT TO authenticated USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_insert" ON "threads" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_update" ON "threads" AS PERMISSIVE FOR UPDATE TO authenticated USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY IF EXISTS "workflows_select" ON "workflows";--> statement-breakpoint
DROP POLICY IF EXISTS "workflows_insert" ON "workflows";--> statement-breakpoint
DROP POLICY IF EXISTS "workflows_update" ON "workflows";--> statement-breakpoint
CREATE POLICY "workflows_select" ON "workflows" AS PERMISSIVE FOR SELECT TO authenticated USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_insert" ON "workflows" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_update" ON "workflows" AS PERMISSIVE FOR UPDATE TO authenticated USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY IF EXISTS "plans_select" ON "plans";--> statement-breakpoint
DROP POLICY IF EXISTS "plans_insert" ON "plans";--> statement-breakpoint
DROP POLICY IF EXISTS "plans_update" ON "plans";--> statement-breakpoint
CREATE POLICY "plans_select" ON "plans" AS PERMISSIVE FOR SELECT TO authenticated USING (exists (select 1 from "workflows" w where w."id" = "plans"."workflow_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "plans_insert" ON "plans" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (exists (select 1 from "workflows" w where w."id" = "plans"."workflow_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "plans_update" ON "plans" AS PERMISSIVE FOR UPDATE TO authenticated USING (exists (select 1 from "workflows" w where w."id" = "plans"."workflow_id" and w."user_id" = auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "plan_steps_select" ON "plan_steps";--> statement-breakpoint
DROP POLICY IF EXISTS "plan_steps_insert" ON "plan_steps";--> statement-breakpoint
DROP POLICY IF EXISTS "plan_steps_update" ON "plan_steps";--> statement-breakpoint
CREATE POLICY "plan_steps_select" ON "plan_steps" AS PERMISSIVE FOR SELECT TO authenticated USING (exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = "plan_steps"."plan_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "plan_steps_insert" ON "plan_steps" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = "plan_steps"."plan_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "plan_steps_update" ON "plan_steps" AS PERMISSIVE FOR UPDATE TO authenticated USING (exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = "plan_steps"."plan_id" and w."user_id" = auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_select" ON "chat_messages";--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_insert" ON "chat_messages";--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_update" ON "chat_messages";--> statement-breakpoint
CREATE POLICY "chat_messages_select" ON "chat_messages" AS PERMISSIVE FOR SELECT TO authenticated USING (exists (select 1 from "threads" t where t."id" = "chat_messages"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "chat_messages_insert" ON "chat_messages" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (exists (select 1 from "threads" t where t."id" = "chat_messages"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "chat_messages_update" ON "chat_messages" AS PERMISSIVE FOR UPDATE TO authenticated USING ("chat_messages"."user_id" = auth.uid() or exists (select 1 from "threads" t where t."id" = "chat_messages"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "runs_select" ON "runs";--> statement-breakpoint
DROP POLICY IF EXISTS "runs_insert" ON "runs";--> statement-breakpoint
DROP POLICY IF EXISTS "runs_update" ON "runs";--> statement-breakpoint
CREATE POLICY "runs_select" ON "runs" AS PERMISSIVE FOR SELECT TO authenticated USING (exists (select 1 from "threads" t where t."id" = "runs"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "runs_insert" ON "runs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (exists (select 1 from "threads" t where t."id" = "runs"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "runs_update" ON "runs" AS PERMISSIVE FOR UPDATE TO authenticated USING ("runs"."user_id" = auth.uid() or exists (select 1 from "threads" t where t."id" = "runs"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "run_activities_select" ON "run_activities";--> statement-breakpoint
CREATE POLICY "run_activities_select" ON "run_activities" AS PERMISSIVE FOR SELECT TO authenticated USING (exists (select 1 from "runs" r where r."id" = "run_activities"."run_id" and exists (select 1 from "threads" t where t."id" = r."thread_id" and t."user_id" = auth.uid())));--> statement-breakpoint
DROP POLICY IF EXISTS "approval_requests_select" ON "approval_requests";--> statement-breakpoint
DROP POLICY IF EXISTS "approval_requests_insert" ON "approval_requests";--> statement-breakpoint
DROP POLICY IF EXISTS "approval_requests_update" ON "approval_requests";--> statement-breakpoint
CREATE POLICY "approval_requests_select" ON "approval_requests" AS PERMISSIVE FOR SELECT TO authenticated USING (exists (select 1 from "threads" t where t."id" = "approval_requests"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "approval_requests_insert" ON "approval_requests" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (exists (select 1 from "threads" t where t."id" = "approval_requests"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "approval_requests_update" ON "approval_requests" AS PERMISSIVE FOR UPDATE TO authenticated USING (exists (select 1 from "threads" t where t."id" = "approval_requests"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_api_keys_select" ON "workspace_api_keys";--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_api_keys_insert" ON "workspace_api_keys";--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_api_keys_update" ON "workspace_api_keys";--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_api_keys_delete" ON "workspace_api_keys";--> statement-breakpoint
CREATE POLICY "workspace_api_keys_select" ON "workspace_api_keys" AS PERMISSIVE FOR SELECT TO authenticated USING (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()));--> statement-breakpoint
CREATE POLICY "workspace_api_keys_insert" ON "workspace_api_keys" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()) and "workspace_api_keys"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspace_api_keys_update" ON "workspace_api_keys" AS PERMISSIVE FOR UPDATE TO authenticated USING (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()));--> statement-breakpoint
CREATE POLICY "workspace_api_keys_delete" ON "workspace_api_keys" AS PERMISSIVE FOR DELETE TO authenticated USING (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()));--> statement-breakpoint
DROP POLICY IF EXISTS "files_select" ON "files";--> statement-breakpoint
CREATE POLICY "files_select" ON "files" AS PERMISSIVE FOR SELECT TO authenticated USING ("files"."user_id" = auth.uid());--> statement-breakpoint
DROP POLICY IF EXISTS "schedules_select" ON "schedules";--> statement-breakpoint
DROP POLICY IF EXISTS "schedules_insert" ON "schedules";--> statement-breakpoint
DROP POLICY IF EXISTS "schedules_update" ON "schedules";--> statement-breakpoint
CREATE POLICY "schedules_select" ON "schedules" AS PERMISSIVE FOR SELECT TO authenticated USING ("schedules"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "schedules_insert" ON "schedules" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ("schedules"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "schedules_update" ON "schedules" AS PERMISSIVE FOR UPDATE TO authenticated USING ("schedules"."user_id" = auth.uid());--> statement-breakpoint
DROP TYPE IF EXISTS "public"."invite_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."invite_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."role";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."thread_role";