CREATE TYPE "public"."plan_level" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'awaiting_approval', 'completed', 'failed', 'sleeping', 'idle');--> statement-breakpoint
CREATE TABLE "callouts" (
	"id" text PRIMARY KEY DEFAULT (concat('cal_', gen_random_uuid()::text)) NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "threads" (
	"id" text PRIMARY KEY DEFAULT (concat('thd_', gen_random_uuid()::text)) NOT NULL,
	"workspace_id" text NOT NULL,
	"group_id" text,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"bound_workflow_id" text,
	"status" "run_status" DEFAULT 'idle' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" text PRIMARY KEY DEFAULT (concat('prf_', gen_random_uuid()::text)) NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"plan" "plan_level" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_workspace_name_idx" ON "groups" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "groups_workspace_position_idx" ON "groups" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "threads_user_workspace_last_msg_idx" ON "threads" USING btree ("user_id","workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "threads_group_idx" ON "threads" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_created_by_name_idx" ON "workspaces" USING btree ("created_by","name");--> statement-breakpoint
CREATE POLICY "groups_select" ON "groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_insert" ON "groups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_update" ON "groups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "groups_delete" ON "groups" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("groups"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_select" ON "threads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_insert" ON "threads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_update" ON "threads" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "threads_delete" ON "threads" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("threads"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_select" ON "user_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_insert" ON "user_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_update" ON "user_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_profiles_delete" ON "user_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_profiles"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspaces_select" ON "workspaces" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspaces_insert" ON "workspaces" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspaces_update" ON "workspaces" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("workspaces"."created_by" = auth.uid());--> statement-breakpoint
CREATE POLICY "workspaces_delete" ON "workspaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("workspaces"."created_by" = auth.uid());