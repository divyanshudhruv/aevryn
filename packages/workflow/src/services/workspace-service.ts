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
		boundWorkflowId: string | null;
}

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
		return db
			.select({
				id: threads.id,
				groupId: threads.groupId,
				title: threads.title,
				updatedAt: threads.updatedAt,
				status: threads.status,
				boundWorkflowId: threads.boundWorkflowId,
			})
			.from(threads)
			.where(eq(threads.workspaceId, workspaceId))
			.orderBy(asc(threads.createdAt), desc(threads.updatedAt))
			.then((rows) =>
				rows.map((r) => ({
					id: r.id,
					groupId: r.groupId,
					title: r.title,
					status: r.status,
					updatedAt: r.updatedAt.toISOString(),
					boundWorkflowId: r.boundWorkflowId,
				})),
			);
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
		// Permanent delete — the thread row and everything under it (messages,
		// steps, bound workflows → plan steps, tool-call logs) cascade via FK.
		await db
			.delete(threads)
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

	async updateWorkspace(input: {
		workspaceId: string;
		userId: string;
		patch: { name?: string; isDefault?: boolean };
	}): Promise<WorkspaceSummary | null> {
		if (input.patch.isDefault === true) {
			// Only one default: clear the flag on the current default first.
			await db
				.update(workspaces)
				.set({ isDefault: false })
				.where(
					and(
						eq(workspaces.createdBy, input.userId),
						eq(workspaces.isDefault, true),
					),
				);
		}
		const [row] = await db
			.update(workspaces)
			.set(input.patch)
			.where(
				and(
					eq(workspaces.id, input.workspaceId),
					eq(workspaces.createdBy, input.userId),
				),
			)
			.returning({
				id: workspaces.id,
				name: workspaces.name,
				isDefault: workspaces.isDefault,
			});
		return row ?? null;
	}

	/** Deletes a workspace (its threads/groups cascade). The last workspace
	 *  cannot be deleted — the app always needs one. */
	async deleteWorkspace(input: {
		workspaceId: string;
		userId: string;
	}): Promise<{ deleted: true } | { deleted: false; reason: string }> {
		const owned = await this.listForUser(input.userId);
		const target = owned.find((w) => w.id === input.workspaceId);
		if (!target) return { deleted: false, reason: "NOT_FOUND" };
		if (owned.length <= 1) {
			return { deleted: false, reason: "LAST_WORKSPACE" };
		}
		await db
			.delete(workspaces)
			.where(
				and(
					eq(workspaces.id, input.workspaceId),
					eq(workspaces.createdBy, input.userId),
				),
			);
		return { deleted: true };
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
