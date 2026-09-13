ALTER TABLE "runs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DEFAULT 'awaiting_approval'::text;--> statement-breakpoint
DROP TYPE "public"."run_status";--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'sleeping', 'awaiting_approval', 'failed', 'completed', 'idle', 'planning', 'stopped');--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DEFAULT 'awaiting_approval'::"public"."run_status";--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DATA TYPE "public"."run_status" USING "status"::"public"."run_status";--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "status" SET DEFAULT 'awaiting_approval'::text;--> statement-breakpoint
DROP TYPE "public"."workflow_status";--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('running', 'sleeping', 'awaiting_approval', 'failed', 'completed', 'idle', 'planning', 'stopped');--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "status" SET DEFAULT 'awaiting_approval'::"public"."workflow_status";--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "status" SET DATA TYPE "public"."workflow_status" USING "status"::"public"."workflow_status";