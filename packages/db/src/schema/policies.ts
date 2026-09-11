import { sql, type SQL } from "drizzle-orm";

export const uid = sql`auth.uid()`;

export const isMemberOf = (workspaceId: unknown): SQL =>
	sql`exists (select 1 from "workspace_members" wm where wm."workspace_id" = ${workspaceId} and wm."user_id" = auth.uid())`;

export const isEditorOf = (workspaceId: unknown): SQL =>
	sql`exists (select 1 from "workspace_members" wm where wm."workspace_id" = ${workspaceId} and wm."user_id" = auth.uid() and wm."role" in ('owner', 'editor'))`;

export const canReadThread = (threadId: unknown): SQL =>
	sql`exists (select 1 from "threads" t where t."id" = ${threadId} and (t."user_id" = auth.uid() or ${isMemberOf(sql`t."workspace_id"`)} or exists (select 1 from "thread_shares" ts where ts."thread_id" = ${threadId} and ts."user_id" = auth.uid())))`;

export const canEditThread = (threadId: unknown): SQL =>
	sql`exists (select 1 from "threads" t where t."id" = ${threadId} and (t."user_id" = auth.uid() or ${isEditorOf(sql`t."workspace_id"`)}))`;

export const workflowVisible = (workflowId: unknown): SQL =>
	sql`exists (select 1 from "workflows" w where w."id" = ${workflowId} and (w."user_id" = auth.uid() or ${isMemberOf(sql`w."workspace_id"`)}))`;

export const workflowEditable = (workflowId: unknown): SQL =>
	sql`exists (select 1 from "workflows" w where w."id" = ${workflowId} and (w."user_id" = auth.uid() or ${isEditorOf(sql`w."workspace_id"`)}))`;

export const workflowOwned = (workflowId: unknown): SQL =>
	sql`exists (select 1 from "workflows" w where w."id" = ${workflowId} and w."user_id" = auth.uid())`;

export const planViaVisibleWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and (w."user_id" = auth.uid() or ${isMemberOf(sql`w."workspace_id"`)}))`;

export const planViaEditableWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and (w."user_id" = auth.uid() or ${isEditorOf(sql`w."workspace_id"`)}))`;

export const planViaOwnedWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and w."user_id" = auth.uid())`;

export const stepViaVisibleWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and (w."user_id" = auth.uid() or ${isMemberOf(sql`w."workspace_id"`)}))`;

export const stepViaEditableWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and (w."user_id" = auth.uid() or ${isEditorOf(sql`w."workspace_id"`)}))`;

export const stepViaOwnedWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and w."user_id" = auth.uid())`;