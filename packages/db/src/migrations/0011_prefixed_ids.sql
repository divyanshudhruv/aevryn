-- 0011_prefixed_ids.sql
-- Switch all text id defaults from raw uuid to prefixed uuid.
-- Preserve existing values; only new rows are affected.

ALTER TABLE "workspaces" ALTER COLUMN "id" SET DEFAULT (concat('wp_', gen_random_uuid()::text));
ALTER TABLE "groups" ALTER COLUMN "id" SET DEFAULT (concat('grp_', gen_random_uuid()::text));
ALTER TABLE "user_profiles" ALTER COLUMN "id" SET DEFAULT (concat('prf_', gen_random_uuid()::text));
ALTER TABLE "threads" ALTER COLUMN "id" SET DEFAULT (concat('thd_', gen_random_uuid()::text));
ALTER TABLE "workflows" ALTER COLUMN "id" SET DEFAULT (concat('wf_', gen_random_uuid()::text));
ALTER TABLE "plans" ALTER COLUMN "id" SET DEFAULT (concat('pln_', gen_random_uuid()::text));
ALTER TABLE "plan_steps" ALTER COLUMN "id" SET DEFAULT (concat('pls_', gen_random_uuid()::text));
ALTER TABLE "chat_messages" ALTER COLUMN "id" SET DEFAULT (concat('msg_', gen_random_uuid()::text));
ALTER TABLE "runs" ALTER COLUMN "id" SET DEFAULT (concat('run_', gen_random_uuid()::text));
ALTER TABLE "run_activities" ALTER COLUMN "id" SET DEFAULT (concat('act_', gen_random_uuid()::text));
ALTER TABLE "approval_requests" ALTER COLUMN "id" SET DEFAULT (concat('apv_', gen_random_uuid()::text));
ALTER TABLE "notifications" ALTER COLUMN "id" SET DEFAULT (concat('not_', gen_random_uuid()::text));
ALTER TABLE "workspace_api_keys" ALTER COLUMN "id" SET DEFAULT (concat('key_', gen_random_uuid()::text));
ALTER TABLE "files" ALTER COLUMN "id" SET DEFAULT (concat('fil_', gen_random_uuid()::text));
ALTER TABLE "schedules" ALTER COLUMN "id" SET DEFAULT (concat('sched_', gen_random_uuid()::text));
ALTER TABLE "webhook_hooks" ALTER COLUMN "id" SET DEFAULT (concat('whk_', gen_random_uuid()::text));
