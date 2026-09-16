-- Thread deletion is now permanent: deleting a group removes its threads
-- (was: group_id set to null), and tool-call logs are cleaned up via their
-- thread. Column deleted_at is removed.
--> statement-breakpoint
ALTER TABLE "threads" DROP CONSTRAINT "threads_group_id_groups_id_fk";--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call_logs" ADD CONSTRAINT "tool_call_logs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Purge threads still soft-deleted under the old behavior (children cascade).
DELETE FROM "threads" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" DROP COLUMN "deleted_at";