CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY DEFAULT (concat('msg_', gen_random_uuid()::text)) NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "steps" (
	"id" text PRIMARY KEY DEFAULT (concat('stp_', gen_random_uuid()::text)) NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_keys" (
	"id" text PRIMARY KEY DEFAULT (concat('key_', gen_random_uuid()::text)) NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_providers" (
	"id" text PRIMARY KEY DEFAULT (concat('prv_', gen_random_uuid()::text)) NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY DEFAULT (concat('us_', gen_random_uuid()::text)) NOT NULL,
	"user_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_steps" (
	"id" text PRIMARY KEY DEFAULT (concat('pls_', gen_random_uuid()::text)) NOT NULL,
	"workflow_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "run_status" DEFAULT 'idle' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY DEFAULT (concat('wf_', gen_random_uuid()::text)) NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"status" "run_status" DEFAULT 'idle' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_providers" ADD CONSTRAINT "user_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_steps" ADD CONSTRAINT "plan_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "steps_thread_position_idx" ON "steps" USING btree ("thread_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "user_keys_user_name_idx" ON "user_keys" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "user_providers_user_slug_idx" ON "user_providers" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_user_id_idx" ON "user_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_steps_workflow_position_idx" ON "plan_steps" USING btree ("workflow_id","position");--> statement-breakpoint
CREATE INDEX "workflows_thread_idx" ON "workflows" USING btree ("thread_id");--> statement-breakpoint
CREATE POLICY "messages_select" ON "messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("messages"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "messages_insert" ON "messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("messages"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "messages_update" ON "messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("messages"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "messages_delete" ON "messages" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("messages"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "steps_select" ON "steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "steps_insert" ON "steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "steps_update" ON "steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "steps_delete" ON "steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_keys_select" ON "user_keys" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_keys"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_keys_insert" ON "user_keys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_keys"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_keys_update" ON "user_keys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_keys"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_keys_delete" ON "user_keys" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_keys"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_providers_select" ON "user_providers" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_providers"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_providers_insert" ON "user_providers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_providers"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_providers_update" ON "user_providers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_providers"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_providers_delete" ON "user_providers" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_providers"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_settings_select" ON "user_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_settings_insert" ON "user_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_settings_update" ON "user_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "user_settings_delete" ON "user_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_settings"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "plan_steps_select" ON "plan_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "plan_steps_insert" ON "plan_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "plan_steps_update" ON "plan_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "plan_steps_delete" ON "plan_steps" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("plan_steps"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_select" ON "workflows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_insert" ON "workflows" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_update" ON "workflows" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("workflows"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "workflows_delete" ON "workflows" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("workflows"."user_id" = auth.uid());