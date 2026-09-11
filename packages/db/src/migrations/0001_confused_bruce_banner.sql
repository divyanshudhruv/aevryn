CREATE TYPE "public"."activity_status" AS ENUM('pending', 'active', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('tool', 'thinking', 'task', 'subtask', 'system');--> statement-breakpoint
CREATE TYPE "public"."api_provider" AS ENUM('groq', 'anakin', 'mem0', 'image', 'speech', 'transcription', 'video');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."group_kind" AS ENUM('custom', 'system');--> statement-breakpoint
CREATE TYPE "public"."invite_kind" AS ENUM('workspace', 'thread');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('draft', 'queued', 'streaming', 'completed', 'failed', 'interrupted');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('system', 'workflow', 'run', 'security', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."plan_level" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'proposed', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."plan_step_status" AS ENUM('pending', 'active', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'sleeping', 'waiting', 'awaiting_approval', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('message', 'schedule', 'resume', 'approval', 'rerun');--> statement-breakpoint
CREATE TYPE "public"."thread_role" AS ENUM('editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('waiting', 'planning', 'running', 'awaiting_approval', 'idle', 'paused', 'failed', 'completed');--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "group_kind" DEFAULT 'custom' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"pre_answers" jsonb,
	"plan" "plan_level" DEFAULT 'free' NOT NULL,
	"prefer_own_keys_in_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"group_id" text,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"share_enabled" boolean DEFAULT false NOT NULL,
	"bound_workflow_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text,
	"workspace_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "workflow_status" DEFAULT 'waiting' NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"title" text NOT NULL,
	"objective" text,
	"summary" text,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_workflow_id_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
CREATE TABLE "plan_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "plan_step_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
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
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"workflow_id" text,
	"user_id" uuid NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"rerun_of" text,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"prompt_snapshot" jsonb,
	"cost_usd" numeric(10, 6),
	"token_count" bigint,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_activities" (
	"id" text PRIMARY KEY NOT NULL,
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
CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
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
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "invite_kind" NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text,
	"invited_by" uuid NOT NULL,
	"invitee_email" text NOT NULL,
	"invited_user_id" uuid,
	"token_hash" text NOT NULL,
	"role" "thread_role" DEFAULT 'editor' NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "thread_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "thread_role" DEFAULT 'editor' NOT NULL,
	"invited_by" uuid NOT NULL,
	"invite_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
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
CREATE TABLE "workspace_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" uuid NOT NULL,
	"provider" "api_provider" NOT NULL,
	"key_encrypted" "bytea" NOT NULL,
	"model_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
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
DROP TABLE "agent_state" CASCADE;--> statement-breakpoint
DROP TABLE "approval" CASCADE;--> statement-breakpoint
DROP TABLE "account" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TABLE "user" CASCADE;--> statement-breakpoint
DROP TABLE "verification" CASCADE;--> statement-breakpoint
DROP TABLE "event" CASCADE;--> statement-breakpoint
DROP TABLE "notification" CASCADE;--> statement-breakpoint
DROP TABLE "observation" CASCADE;--> statement-breakpoint
DROP TABLE "recovery_attempt" CASCADE;--> statement-breakpoint
DROP TABLE "schedule" CASCADE;--> statement-breakpoint
DROP TABLE "tool_execution" CASCADE;--> statement-breakpoint
DROP TABLE "webhook_board" CASCADE;--> statement-breakpoint
DROP TABLE "workflow" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_execution" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_step" CASCADE;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_rerun_of_runs_id_fk" FOREIGN KEY ("rerun_of") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_activities" ADD CONSTRAINT "run_activities_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_activities" ADD CONSTRAINT "run_activities_parent_id_run_activities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."run_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_shares" ADD CONSTRAINT "thread_shares_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_shares" ADD CONSTRAINT "thread_shares_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_created_by_name_idx" ON "workspaces" USING btree ("created_by","name");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_workspace_name_idx" ON "groups" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "groups_workspace_position_idx" ON "groups" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_idx" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "threads_user_workspace_last_msg_idx" ON "threads" USING btree ("user_id","workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "threads_group_idx" ON "threads" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "workflows_user_status_idx" ON "workflows" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "workflows_thread_idx" ON "workflows" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_steps_plan_position_idx" ON "plan_steps" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_status_idx" ON "chat_messages" USING btree ("thread_id","status");--> statement-breakpoint
CREATE INDEX "runs_thread_created_idx" ON "runs" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_workflow_status_idx" ON "runs" USING btree ("workflow_id","status");--> statement-breakpoint
CREATE INDEX "run_activities_run_created_idx" ON "run_activities" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "approval_requests_status_created_idx" ON "approval_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "approval_requests_thread_idx" ON "approval_requests" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "invites_thread_idx" ON "invites" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "invites_token_hash_idx" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_shares_thread_user_idx" ON "thread_shares" USING btree ("thread_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_api_keys_workspace_provider_idx" ON "workspace_api_keys" USING btree ("workspace_id","provider");