import { sql, type SQL } from "drizzle-orm";

// Single-user RLS: every workspace belongs to its creator (`created_by`)
// and every thread/workflow to its owner (`user_id`). No membership or
// share tables exist, so all checks reduce to the owning column.

// Workspace owned by the current user.
export const ownsWorkspace = (workspaceId: unknown): SQL =>
	sql`exists (select 1 from "workspaces" w where w."id" = ${workspaceId} and w."created_by" = auth.uid())`;

// Owner can read/edit a thread.
export const canReadThread = (threadId: unknown): SQL =>
	sql`exists (select 1 from "threads" t where t."id" = ${threadId} and t."user_id" = auth.uid())`;

export const canEditThread = (threadId: unknown): SQL =>
	sql`exists (select 1 from "threads" t where t."id" = ${threadId} and t."user_id" = auth.uid())`;

// Owner of the workflow can see/edit it.
export const workflowVisible = (workflowId: unknown): SQL =>
	sql`exists (select 1 from "workflows" w where w."id" = ${workflowId} and w."user_id" = auth.uid())`;

export const workflowEditable = (workflowId: unknown): SQL =>
	sql`exists (select 1 from "workflows" w where w."id" = ${workflowId} and w."user_id" = auth.uid())`;

export const workflowOwned = (workflowId: unknown): SQL =>
	sql`exists (select 1 from "workflows" w where w."id" = ${workflowId} and w."user_id" = auth.uid())`;

// plan steps ride on plans → workflows; plans policies are not
// self-referential, so the chain is recursion-free.
export const stepViaVisibleWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and w."user_id" = auth.uid())`;

export const stepViaEditableWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and w."user_id" = auth.uid())`;

export const stepViaOwnedWorkflow = (planId: unknown): SQL =>
	sql`exists (select 1 from "plans" p join "workflows" w on w."id" = p."workflow_id" where p."id" = ${planId} and w."user_id" = auth.uid())`;