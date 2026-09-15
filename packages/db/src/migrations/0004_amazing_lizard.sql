ALTER TABLE "messages" ADD COLUMN "parts" jsonb;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "auto_approve" boolean DEFAULT false NOT NULL;