ALTER TYPE "public"."run_status" ADD VALUE 'retrying' BEFORE 'awaiting_approval';--> statement-breakpoint
ALTER TABLE "threads" DROP CONSTRAINT "threads_group_id_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call_logs" ADD CONSTRAINT "tool_call_logs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" DROP COLUMN "deleted_at";