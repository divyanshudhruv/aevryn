CREATE TYPE "public"."group_kind" AS ENUM('custom', 'system');--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "kind" "group_kind" DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "prefer_own_keys_in_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER POLICY "groups_delete" ON "groups" TO authenticated USING ("groups"."kind" = 'custom' and "groups"."user_id" = auth.uid());