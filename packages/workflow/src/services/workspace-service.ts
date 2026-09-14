import { db, groups, ids, threads, userProfiles, workspaces } from "@aevryn/db";
import { and, asc, desc, eq } from "drizzle-orm";

import { sidebarService } from "./sidebar-service";

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

/**
 * Workspace + sidebar data service.
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
				status: threads.status,
				deletedAt: threads.deletedAt,
			})
			.from(threads)
			.where(eq(threads.workspaceId, workspaceId))
			.orderBy(asc(threads.createdAt), desc(threads.updatedAt));

		return rows
			.filter((r) => !r.deletedAt)
			.map((r) => ({
				id: r.id,
				groupId: r.groupId,
				title: r.title,
				status: r.status,
				updatedAt: r.updatedAt.toISOString(),
			}));
	}

	async ensureDefaultWorkspace(userId: string): Promise<string> {
		const [existing] = await db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(eq(workspaces.createdBy, userId))
			.orderBy(desc(workspaces.isDefault), asc(workspaces.createdAt))
			.limit(1);

		if (existing) return existing.id;

		const [created] = await db
			.insert(workspaces)
			.values({
				id: ids.workspace(),
				createdBy: userId,
				name: "PERSONAL",
				isDefault: true,
			})
			.returning({ id: workspaces.id });

		return created!.id;
	}

	async getDefaultWorkspaceId(userId: string): Promise<string | null> {
		const [row] = await db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(eq(workspaces.createdBy, userId))
			.orderBy(desc(workspaces.isDefault), asc(workspaces.createdAt))
			.limit(1);
		return row?.id ?? null;
	}

	async createGroup(
		workspaceId: string,
		userId: string,
		name: string,
	): Promise<{ id: string; name: string }> {
		const normalizedName = name.toUpperCase();
		const lastPos = await db
			.select({ position: groups.position })
			.from(groups)
			.where(eq(groups.workspaceId, workspaceId))
			.orderBy(desc(groups.position))
			.limit(1);

		const position = (lastPos[0]?.position ?? -1) + 1;

		const [group] = await db
			.insert(groups)
			.values({
				id: ids.group(),
				workspaceId,
				userId,
				name: normalizedName,
				position,
			})
			.returning({ id: groups.id, name: groups.name });

		return group!;
	}

	async renameGroup(
		groupId: string,
		userId: string,
		name: string,
	): Promise<void> {
		await db
			.update(groups)
			.set({ name: name.toUpperCase() })
			.where(and(eq(groups.id, groupId), eq(groups.userId, userId)));
	}

	async deleteGroup(groupId: string, userId: string): Promise<void> {
		await db
			.delete(groups)
			.where(and(eq(groups.id, groupId), eq(groups.userId, userId)));
	}

	async renameThread(
		threadId: string,
		userId: string,
		title: string,
	): Promise<void> {
		await db
			.update(threads)
			.set({ title: title.trim() })
			.where(and(eq(threads.id, threadId), eq(threads.userId, userId)));
	}

	async deleteThread(threadId: string, userId: string): Promise<void> {
		await db
			.update(threads)
			.set({ deletedAt: new Date() })
			.where(and(eq(threads.id, threadId), eq(threads.userId, userId)));
	}

	async createThread(
		workspaceId: string,
		userId: string,
		groupId: string | null,
		title: string,
	): Promise<{ id: string; title: string; groupId: string | null }> {
		const [thread] = await db
			.insert(threads)
			.values({
				id: ids.thread(),
				workspaceId,
				userId,
				groupId: groupId ?? null,
				title: title.trim() || "New thread",
			})
			.returning({
				id: threads.id,
				title: threads.title,
				groupId: threads.groupId,
			});

		return thread!;
	}

	async getProfile(userId: string) {
		const [row] = await db
			.select({ name: userProfiles.name, avatarUrl: userProfiles.avatarUrl })
			.from(userProfiles)
			.where(eq(userProfiles.userId, userId))
			.limit(1);
		return { name: row?.name ?? null, avatarUrl: row?.avatarUrl ?? null };
	}

	async getSidebarData(userId: string, requestedWorkspaceId?: string | null) {
		const workspaces = await this.listForUser(userId);
		if (workspaces.length === 0) {
			return {
				workspace: null,
				workspaces: [],
				groups: [],
				threads: [],
				userName: null,
				userAvatarUrl: null,
				promoCards: [],
			};
		}
		const workspace = workspaces.find((w) => w.id === requestedWorkspaceId) ?? workspaces[0]!;
		const [groups, threads, profile, promoCards] = await Promise.all([
			this.listGroups(workspace.id),
			this.listThreads(workspace.id),
			db.select({ name: userProfiles.name, avatarUrl: userProfiles.avatarUrl })
				.from(userProfiles)
				.where(eq(userProfiles.userId, userId))
				.limit(1),
			sidebarService.listPromoCards(),
		]);
		return {
			workspace,
			workspaces,
			groups,
			threads,
			userName: profile[0]?.name ?? null,
			userAvatarUrl: profile[0]?.avatarUrl ?? null,
			promoCards,
		};
	}
}
