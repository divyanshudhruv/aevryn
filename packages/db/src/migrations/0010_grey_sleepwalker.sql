ALTER TABLE "tool_call_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tool_call_logs" ALTER COLUMN "id" SET DEFAULT (concat('tl_', gen_random_uuid()::text));--> statement-breakpoint
ALTER TABLE "tool_call_logs" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_call_logs" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "tool_call_logs" ADD CONSTRAINT "tool_call_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call_logs" ADD CONSTRAINT "tool_call_logs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tool_call_logs_select" ON "tool_call_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("tool_call_logs"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "tool_call_logs_insert" ON "tool_call_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("tool_call_logs"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "tool_call_logs_update" ON "tool_call_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("tool_call_logs"."user_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "tool_call_logs_delete" ON "tool_call_logs" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("tool_call_logs"."user_id" = auth.uid());