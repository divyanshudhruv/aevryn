ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."threads";--> statement-breakpoint
ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."plan_steps";--> statement-breakpoint
ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."workflows";--> statement-breakpoint
ALTER TABLE "public"."threads" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "public"."plan_steps" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "public"."workflows" REPLICA IDENTITY FULL;