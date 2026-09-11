-- schedules + webhook_hooks (commit 8). Drizzle-managed; mirrored for
-- local supabase reset. See SCHEMA.md §18/§19 + SCHEDULE-WEBHOOK-REHOMING.md.

CREATE TYPE "public"."hook_status" AS ENUM('active', 'fired', 'expired');--> statement-breakpoint
CREATE TABLE "public"."schedules" (
	"id" text PRIMARY KEY NOT NULL,
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
);--> statement-breakpoint
ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "public"."webhook_hooks" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "public"."hook_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fired_at" timestamp with time zone,
	"consume_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_hooks_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
ALTER TABLE "public"."webhook_hooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."schedules" ADD CONSTRAINT "schedules_last_run_id_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."webhook_hooks" ADD CONSTRAINT "webhook_hooks_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."webhook_hooks" ADD CONSTRAINT "webhook_hooks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."webhook_hooks" ADD CONSTRAINT "webhook_hooks_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_workspace_thread_idx" ON "public"."schedules" USING btree ("workspace_id","thread_id");--> statement-breakpoint
CREATE INDEX "schedules_enabled_next_run_idx" ON "public"."schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "webhook_hooks_run_idx" ON "public"."webhook_hooks" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "webhook_hooks_status_expiry_idx" ON "public"."webhook_hooks" USING btree ("status","expires_at");--> statement-breakpoint
CREATE POLICY "schedules_select" ON "public"."schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("schedules"."user_id" = auth.uid() or exists (select 1 from "public"."workspace_members" wm where wm."workspace_id" = "schedules"."workspace_id" and wm."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "schedules_insert" ON "public"."schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("schedules"."user_id" = auth.uid() or exists (select 1 from "public"."workspace_members" wm where wm."workspace_id" = "schedules"."workspace_id" and wm."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "schedules_update" ON "public"."schedules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("schedules"."user_id" = auth.uid() or exists (select 1 from "public"."workspace_members" wm where wm."workspace_id" = "schedules"."workspace_id" and wm."user_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "schedules_delete" ON "public"."schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("schedules"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_select" ON "public"."webhook_hooks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_insert" ON "public"."webhook_hooks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_update" ON "public"."webhook_hooks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "webhook_hooks_delete" ON "public"."webhook_hooks" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("webhook_hooks"."user_id" = auth.uid());--> statement-breakpoint
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."schedules";--> statement-breakpoint
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."webhook_hooks";