ALTER TABLE "user_profiles" ALTER COLUMN "name" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "email" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "user_profiles" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "pfp" text DEFAULT '' NOT NULL;