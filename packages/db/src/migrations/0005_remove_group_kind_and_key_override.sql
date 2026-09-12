-- Single-user cleanup (follows 0004_open_jean_grey):
-- 1. groups: drop `kind` (system groups are removed by design — the group
--    list starts empty and holds only user-created groups), rewrite the
--    delete policy owner-only, and simplify the ≤3 groups/workspace trigger.
-- 2. user_profiles: drop `prefer_own_keys_in_shared` (member key override
--    was removed with the single-user pivot).

-- groups_delete: owner-only (no system-kind guard anymore)
DROP POLICY IF EXISTS "groups_delete" ON "groups";--> statement-breakpoint
CREATE POLICY "groups_delete" ON "groups" AS PERMISSIVE FOR DELETE TO authenticated USING ("groups"."user_id" = auth.uid());--> statement-breakpoint

-- System-group protection no longer applies (system groups removed)
DROP TRIGGER IF EXISTS "prevent_system_group_delete" ON "groups";--> statement-breakpoint
DROP FUNCTION IF EXISTS "public"."prevent_system_group_delete"();--> statement-breakpoint

-- Group limit: count ALL groups (custom only now exists)
DROP TRIGGER IF EXISTS "enforce_group_limit" ON "groups";--> statement-breakpoint
DROP FUNCTION IF EXISTS "public"."enforce_group_limit"();--> statement-breakpoint
CREATE FUNCTION "public"."enforce_group_limit"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    SELECT count(*) FROM "public"."groups" g
    WHERE g."workspace_id" = NEW."workspace_id"
  ) >= 3 THEN
    RAISE EXCEPTION 'Group limit reached: max 3 groups per workspace (free plan)';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "enforce_group_limit"
  BEFORE INSERT ON "public"."groups"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_group_limit"();--> statement-breakpoint

-- Drop the kind column (unique index spans it? no — recreate to be safe)
DROP INDEX IF EXISTS "groups_workspace_name_idx";--> statement-breakpoint
ALTER TABLE "groups" DROP COLUMN IF EXISTS "kind";--> statement-breakpoint
CREATE UNIQUE INDEX "groups_workspace_name_idx" ON "groups" USING btree ("workspace_id","name");--> statement-breakpoint

-- Member key override leftover
ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "prefer_own_keys_in_shared";--> statement-breakpoint

DROP TYPE IF EXISTS "public"."group_kind";
