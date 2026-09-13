CREATE TYPE "public"."activity_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('tool', 'thinking', 'system');--> statement-breakpoint
CREATE TYPE "public"."api_provider" AS ENUM('groq', 'anakin', 'mem0');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."hook_status" AS ENUM('active', 'fired', 'expired');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'streaming', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('run', 'system');--> statement-breakpoint
CREATE TYPE "public"."plan_level" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."plan_step_status" AS ENUM('pending', 'active', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'awaiting_approval', 'queued', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('message', 'schedule', 'resume', 'approval', 'rerun');--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY DEFAULT (concat('wp_', gen_random_uuid()::text)) NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY DEFAULT (concat('grp_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" text PRIMARY KEY DEFAULT (concat('prf_', gen_random_uuid()::text)) NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"pfp" text DEFAULT '' NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"pre_answers" jsonb,
	"plan" "plan_level" DEFAULT 'free' NOT NULL,
	"prefer_own_keys_in_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY DEFAULT (concat('thd_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text NOT NULL,
	"group_id" text,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY DEFAULT (concat('wf_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_steps" (
	"id" text PRIMARY KEY DEFAULT (concat('pls_', gen_random_uuid()::text)) NOT NULL,
	"workflow_id" text NOT NULL,
	"objective" text,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "plan_step_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY DEFAULT (concat('msg_', gen_random_uuid()::text)) NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" jsonb NOT NULL,
	"run_id" text,
	"status" "message_status" DEFAULT 'completed' NOT NULL,
	"queue_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY DEFAULT (concat('run_', gen_random_uuid()::text)) NOT NULL,
	"thread_id" text NOT NULL,
	"workflow_id" text,
	"user_id" uuid NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"rerun_of" text,
	"status" "run_status" DEFAULT 'awaiting_approval' NOT NULL,
	"prompt_snapshot" jsonb,
	"cost_usd" numeric(10, 6),
	"token_count" bigint,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_activities" (
	"id" text PRIMARY KEY DEFAULT (concat('act_', gen_random_uuid()::text)) NOT NULL,
	"run_id" text NOT NULL,
	"parent_id" text,
	"type" "activity_type" NOT NULL,
	"status" "activity_status" DEFAULT 'pending' NOT NULL,
	"step_label" text,
	"title" text,
	"description" text,
	"detail" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY DEFAULT (concat('apv_', gen_random_uuid()::text)) NOT NULL,
	"run_id" text NOT NULL,
	"workflow_id" text,
	"thread_id" text,
	"user_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"input" jsonb,
	"schema" jsonb,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY DEFAULT (concat('not_', gen_random_uuid()::text)) NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_api_keys" (
	"id" text PRIMARY KEY DEFAULT (concat('key_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" uuid NOT NULL,
	"provider" "api_provider" NOT NULL,
	"key_encrypted" "bytea" NOT NULL,
	"model_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY DEFAULT (concat('fil_', gen_random_uuid()::text)) NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" text,
	"workspace_id" text NOT NULL,
	"bucket" text DEFAULT 'chat-attachments' NOT NULL,
	"path" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"compressed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" text PRIMARY KEY DEFAULT (concat('sched_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"cron" text,
	"interval_seconds" integer,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_run_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_hooks" (
	"id" text PRIMARY KEY DEFAULT (concat('whk_', gen_random_uuid()::text)) NOT NULL,
	"run_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "hook_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fired_at" timestamp with time zone,
	"consume_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_hooks_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "webhook_hooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "global_settings" (
	"id" text PRIMARY KEY DEFAULT (concat('gs_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"settings" text DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "global_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "thread_settings" (
	"id" text PRIMARY KEY DEFAULT (concat('ts_', gen_random_uuid()::text)) NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"settings" text DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thread_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "callouts" (
	"id" text PRIMARY KEY DEFAULT (concat('cal_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text,
	"user_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "callouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "thread_workflow_bindings" (
	"id" text PRIMARY KEY DEFAULT (concat('bnd_', gen_random_uuid()::text)) NOT NULL,
	"thread_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thread_workflow_bindings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_rerun_of_runs_id_fk" FOREIGN KEY ("rerun_of") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_activities" ADD CONSTRAINT "run_activities_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_activities" ADD CONSTRAINT "run_activities_parent_id_run_activities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."run_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_last_run_id_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_hooks" ADD CONSTRAINT "webhook_hooks_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_hooks" ADD CONSTRAINT "webhook_hooks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_hooks" ADD CONSTRAINT "webhook_hooks_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_settings" ADD CONSTRAINT "global_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_settings" ADD CONSTRAINT "thread_settings_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callouts" ADD CONSTRAINT "callouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callouts" ADD CONSTRAINT "callouts_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_workflow_bindings" ADD CONSTRAINT "thread_workflow_bindings_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_workflow_bindings" ADD CONSTRAINT "thread_workflow_bindings_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_workflow_bindings" ADD CONSTRAINT "thread_workflow_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_created_by_name_idx" ON "workspaces" USING btree ("created_by","name");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_workspace_name_idx" ON "groups" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "groups_workspace_position_idx" ON "groups" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "threads_user_workspace_last_msg_idx" ON "threads" USING btree ("user_id","workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "threads_group_idx" ON "threads" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "workflows_user_status_idx" ON "workflows" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_steps_workflow_position_idx" ON "plan_steps" USING btree ("workflow_id","position");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_status_idx" ON "chat_messages" USING btree ("thread_id","status");--> statement-breakpoint
CREATE INDEX "runs_thread_created_idx" ON "runs" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_workflow_status_idx" ON "runs" USING btree ("workflow_id","status");--> statement-breakpoint
CREATE INDEX "run_activities_run_created_idx" ON "run_activities" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "approval_requests_status_created_idx" ON "approval_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "approval_requests_thread_idx" ON "approval_requests" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_api_keys_workspace_provider_idx" ON "workspace_api_keys" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_workspace_thread_idx" ON "schedules" USING btree ("workspace_id","thread_id");--> statement-breakpoint
CREATE INDEX "schedules_enabled_next_run_idx" ON "schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "webhook_hooks_run_idx" ON "webhook_hooks" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "webhook_hooks_status_expiry_idx" ON "webhook_hooks" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "global_settings_user_idx" ON "global_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "thread_settings_thread_idx" ON "thread_settings" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "thread_settings_user_idx" ON "thread_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "callouts_workspace_idx" ON "callouts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "callouts_user_idx" ON "callouts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_workflow_bindings_thread_uq" ON "thread_workflow_bindings" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "thread_workflow_bindings_workflow_idx" ON "thread_workflow_bindings" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "thread_workflow_bindings_user_idx" ON "thread_workflow_bindings" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "workspaces_select" ON "workspaces" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspaces_insert" ON "workspaces" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspaces_update" ON "workspaces" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspaces_delete" ON "workspaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_select" ON "groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_insert" ON "groups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_update" ON "groups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_delete" ON "groups" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_select" ON "user_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_insert" ON "user_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_update" ON "user_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_delete" ON "user_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_select" ON "threads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_insert" ON "threads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_update" ON "threads" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_delete" ON "threads" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_select" ON "workflows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_insert" ON "workflows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_update" ON "workflows" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_delete" ON "workflows" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "plan_steps_select" ON "plan_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "workflows" w where w."id" = "plan_steps"."workflow_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "plan_steps_insert" ON "plan_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "workflows" w where w."id" = "plan_steps"."workflow_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "plan_steps_update" ON "plan_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from "workflows" w where w."id" = "plan_steps"."workflow_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "plan_steps_delete" ON "plan_steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from "workflows" w where w."id" = "plan_steps"."workflow_id" and w."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "chat_messages_select" ON "chat_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "chat_messages"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "chat_messages_insert" ON "chat_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "threads" t where t."id" = "chat_messages"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "chat_messages_update" ON "chat_messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("chat_messages"."user_id" = auth.uid() or exists (select 1 from "threads" t where t."id" = "chat_messages"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "chat_messages_delete" ON "chat_messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("chat_messages"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "runs_select" ON "runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "runs"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "runs_insert" ON "runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "threads" t where t."id" = "runs"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "runs_update" ON "runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("runs"."user_id" = auth.uid() or exists (select 1 from "threads" t where t."id" = "runs"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "runs_delete" ON "runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("runs"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "run_activities_select" ON "run_activities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "runs" r where r."id" = "run_activities"."run_id" and exists (select 1 from "threads" t where t."id" = r."thread_id" and t."user_id" = auth.uid())));--> statement-breakpoint
CREATE POLICY "approval_requests_select" ON "approval_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "approval_requests"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "approval_requests_insert" ON "approval_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "threads" t where t."id" = "approval_requests"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "approval_requests_update" ON "approval_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "approval_requests"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "notifications_select" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("notifications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "notifications_insert" ON "notifications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("notifications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "notifications_update" ON "notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("notifications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "notifications_delete" ON "notifications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("notifications"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspace_api_keys_select" ON "workspace_api_keys" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()));--> statement-breakpoint
CREATE POLICY "workspace_api_keys_insert" ON "workspace_api_keys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()) and "workspace_api_keys"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspace_api_keys_update" ON "workspace_api_keys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()));--> statement-breakpoint
CREATE POLICY "workspace_api_keys_delete" ON "workspace_api_keys" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from "workspaces" w where w."id" = "workspace_api_keys"."workspace_id" and w."created_by" = auth.uid()));--> statement-breakpoint
CREATE POLICY "files_select" ON "files" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("files"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "files_insert" ON "files" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("files"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "files_update" ON "files" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("files"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "files_delete" ON "files" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("files"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "schedules_select" ON "schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("schedules"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "schedules_insert" ON "schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("schedules"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "schedules_update" ON "schedules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("schedules"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "schedules_delete" ON "schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("schedules"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_select" ON "webhook_hooks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_insert" ON "webhook_hooks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_update" ON "webhook_hooks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_delete" ON "webhook_hooks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "global_settings_select" ON "global_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("global_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "global_settings_insert" ON "global_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("global_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "global_settings_update" ON "global_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("global_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "global_settings_delete" ON "global_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("global_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "thread_settings_select" ON "thread_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "thread_settings"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "thread_settings_insert" ON "thread_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "threads" t where t."id" = "thread_settings"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "thread_settings_update" ON "thread_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "thread_settings"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "thread_settings_delete" ON "thread_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "thread_settings"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "callouts_select" ON "callouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
				"callouts"."user_id" = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = "callouts"."workspace_id"
					  and w."created_by" = auth.uid()
				)
			);--> statement-breakpoint
CREATE POLICY "callouts_insert" ON "callouts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
				"callouts"."user_id" = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = "callouts"."workspace_id"
					  and w."created_by" = auth.uid()
				)
			);--> statement-breakpoint
CREATE POLICY "callouts_update" ON "callouts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
				"callouts"."user_id" = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = "callouts"."workspace_id"
					  and w."created_by" = auth.uid()
				)
			);--> statement-breakpoint
CREATE POLICY "callouts_delete" ON "callouts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
				"callouts"."user_id" = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = "callouts"."workspace_id"
					  and w."created_by" = auth.uid()
				)
			);--> statement-breakpoint
CREATE POLICY "thread_workflow_bindings_select" ON "thread_workflow_bindings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "thread_workflow_bindings"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "thread_workflow_bindings_insert" ON "thread_workflow_bindings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "threads" t where t."id" = "thread_workflow_bindings"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "thread_workflow_bindings_update" ON "thread_workflow_bindings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "thread_workflow_bindings"."thread_id" and t."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "thread_workflow_bindings_delete" ON "thread_workflow_bindings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from "threads" t where t."id" = "thread_workflow_bindings"."thread_id" and t."user_id" = auth.uid()));