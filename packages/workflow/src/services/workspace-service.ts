import { db, groups, runs, threads, workspaces } from "@aevryn/db";
import { asc, desc, eq } from "drizzle-orm";

export interface WorkspaceSummary {
	id: string;
	name: string;
	isDefault: boolean;
}

export interface GroupSummary {
	id: string;
	name: string;
	position: number;
}

export interface ThreadSummary {
	id: string;
	groupId: string | null;
	title: string;
	status: string;
	updatedAt: string;
}

export interface ThreadOperationService {
	renameThread(threadId: string, userId: string, title: string): Promise<void>;
	deleteThread(threadId: string, userId: string): Promise<void>;
	createGroup(workspaceId: string, userId: string, name: string): Promise<{ id: string; name: string }>;
	renameGroup(groupId: string, userId: string, name: string): Promise<void>;
	deleteGroup(groupId: string, userId: string): Promise<void>;
}

const ACTIVE_RUN = new Set(["queued", "running", "awaiting_approval"]);

/**
 * Workspace + sidebar data service. One read path for the sidebar:
 * workspaces owned by the user, groups per workspace, and threads with a
 * run-derived status ("idle" unless an active/awaiting run exists).
 */
export class WorkspaceService {
	async listForUser(userId: string): Promise<WorkspaceSummary[]> {
		return db
			.select({
				id: workspaces.id,
				name: workspaces.name,
				isDefault: workspaces.isDefault,
			})
			.from(workspaces)
			.where(eq(workspaces.createdBy, userId))
			.orderBy(desc(workspaces.isDefault), asc(workspaces.createdAt));
	}

	async listGroups(workspaceId: string): Promise<GroupSummary[]> {
		return db
			.select({
				id: groups.id,
				name: groups.name,
				position: groups.position,
			})
			.from(groups)
			.where(eq(groups.workspaceId, workspaceId))
			.orderBy(asc(groups.position), asc(groups.createdAt));
	}

	async listThreads(workspaceId: string): Promise<ThreadSummary[]> {
		const rows = await db
			.select({
				id: threads.id,
				groupId: threads.groupId,
				title: threads.title,
				updatedAt: threads.updatedAt,
				deletedAt: threads.deletedAt,
				runStatus: runs.status,
			})
			.from(threads)
			.leftJoin(runs, eq(runs.threadId, threads.id))
			.where(eq(threads.workspaceId, workspaceId))
			.orderBy(asc(threads.createdAt), desc(threads.updatedAt));

		// Collapse to one row per thread, preferring an active run status.
		const byThread = new Map<string, ThreadSummary>();
		for (const row of rows) {
			if (row.deletedAt) continue;
			const existing = byThread.get(row.id);
			const status =
				row.runStatus && ACTIVE_RUN.has(row.runStatus) ? row.runStatus : "idle";
			if (!existing) {
				byThread.set(row.id, {
					id: row.id,
					groupId: row.groupId,
					title: row.title,
					status,
					updatedAt: row.updatedAt.toISOString(),
				});
			} else if (status !== "idle" && existing.status === "idle") {
				existing.status = status;
			}
		}
		return [...byThread.values()];
	}
}
