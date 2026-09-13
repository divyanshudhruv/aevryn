ALTER TABLE "workspaces" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "plan_steps" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "run_activities" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "approval_requests" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "webhook_hooks" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid()::text);