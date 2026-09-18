ALTER TABLE "callouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "steps_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "callouts_select_anon" ON "callouts" AS PERMISSIVE FOR SELECT TO "anon" USING (true);--> statement-breakpoint
CREATE POLICY "callouts_select_auth" ON "callouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);