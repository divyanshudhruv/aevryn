import { createHash, randomBytes } from "node:crypto";
import {
	type Db,
	db,
	type Invite,
	ids,
	invites,
	type ThreadShare,
	threadShares,
	type WorkspaceMember,
	workspaceMembers,
} from "@aevryn/db";
import { and, eq } from "drizzle-orm";

export type MembershipRole = "owner" | "editor" | "viewer";

export interface CreateInviteInput {
	kind: "workspace" | "thread";
	workspaceId: string;
	threadId?: string;
	invitedBy: string;
	inviteeEmail: string;
	role?: "editor" | "viewer";
	expiresAt?: Date;
}

export class MemberService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	// ── workspace_members ─────────────────────────────────────────────

	async addMember(
		workspaceId: string,
		userId: string,
		role: MembershipRole = "viewer",
	): Promise<WorkspaceMember> {
		const existing = await this.findByUser(workspaceId, userId);
		if (existing) {
			return existing;
		}
		const [row] = await this.scope()
			.insert(workspaceMembers)
			.values({
				id: ids.workspaceMember(),
				workspaceId,
				userId,
				role,
			})
			.onConflictDoNothing({
				target: [workspaceMembers.workspaceId, workspaceMembers.userId],
			})
			.returning();
		return row!;
	}

	async findByUser(
		workspaceId: string,
		userId: string,
	): Promise<WorkspaceMember | undefined> {
		return this.scope().query.workspaceMembers.findFirst({
			where: and(
				eq(workspaceMembers.workspaceId, workspaceId),
				eq(workspaceMembers.userId, userId),
			),
		});
	}

	async listByWorkspace(workspaceId: string): Promise<WorkspaceMember[]> {
		return this.scope().query.workspaceMembers.findMany({
			where: eq(workspaceMembers.workspaceId, workspaceId),
		});
	}

	async listByUser(userId: string): Promise<WorkspaceMember[]> {
		return this.scope().query.workspaceMembers.findMany({
			where: eq(workspaceMembers.userId, userId),
			with: { workspace: true },
		});
	}

	async getRole(
		workspaceId: string,
		userId: string,
	): Promise<MembershipRole | undefined> {
		return (await this.findByUser(workspaceId, userId))?.role;
	}

	async setRole(
		workspaceId: string,
		userId: string,
		role: MembershipRole,
	): Promise<WorkspaceMember | undefined> {
		const [row] = await this.scope()
			.update(workspaceMembers)
			.set({ role })
			.where(
				and(
					eq(workspaceMembers.workspaceId, workspaceId),
					eq(workspaceMembers.userId, userId),
				),
			)
			.returning();
		return row;
	}

	async removeMember(workspaceId: string, userId: string): Promise<void> {
		await this.scope()
			.delete(workspaceMembers)
			.where(
				and(
					eq(workspaceMembers.workspaceId, workspaceId),
					eq(workspaceMembers.userId, userId),
				),
			);
	}

	async isMember(workspaceId: string, userId: string): Promise<boolean> {
		return (await this.getRole(workspaceId, userId)) !== undefined;
	}

	async isEditor(workspaceId: string, userId: string): Promise<boolean> {
		const role = await this.getRole(workspaceId, userId);
		return role === "owner" || role === "editor";
	}

	// ── invites ───────────────────────────────────────────────────────

	async createInvite(
		input: CreateInviteInput,
	): Promise<{ invite: Invite; token: string }> {
		const token = randomBytes(32).toString("base64url");
		const [row] = await this.scope()
			.insert(invites)
			.values({
				id: ids.invite(),
				kind: input.kind,
				workspaceId: input.workspaceId,
				threadId: input.threadId ?? null,
				invitedBy: input.invitedBy,
				inviteeEmail: input.inviteeEmail,
				tokenHash: hashToken(token),
				role: input.role ?? "editor",
				expiresAt: input.expiresAt ?? defaultExpiry(),
			})
			.returning();
		return { invite: row!, token };
	}

	async lookupInvite(token: string): Promise<Invite | undefined> {
		const invite = await this.scope().query.invites.findFirst({
			where: eq(invites.tokenHash, hashToken(token)),
			with: { workspace: true, thread: true },
		});
		if (!invite) {
			return undefined;
		}
		if (invite.status !== "pending") {
			return undefined;
		}
		if (invite.expiresAt.getTime() < Date.now()) {
			await this.revokeInvite(invite.id);
			return undefined;
		}
		return invite;
	}

	/**
	 * Accept an invite and fan out to the right join table:
	 * - workspace invite → workspace_members row (editor/viewer)
	 * - thread invite  → thread_shares row
	 */
	async acceptInvite(
		inviteId: string,
		userId: string,
	): Promise<{
		invite: Invite;
		membership?: WorkspaceMember;
		share?: ThreadShare;
	}> {
		const [invite] = await this.scope()
			.update(invites)
			.set({
				status: "accepted",
				invitedUserId: userId,
				acceptedAt: new Date(),
			})
			.where(and(eq(invites.id, inviteId), eq(invites.status, "pending")))
			.returning();
		if (!invite) {
			throw new Error("invite is not pending");
		}
		if (invite.kind === "workspace") {
			const membership = await this.addMember(
				invite.workspaceId,
				userId,
				invite.role === "editor" ? "editor" : "viewer",
			);
			return { invite, membership };
		}
		if (!invite.threadId) {
			throw new Error("thread invite without thread_id");
		}
		const share = await this.addThreadShare(
			invite.threadId,
			userId,
			invite.role,
			invite.invitedBy,
			invite.id,
		);
		return { invite, share };
	}

	async revokeInvite(id: string): Promise<void> {
		await this.scope()
			.update(invites)
			.set({ status: "revoked" })
			.where(eq(invites.id, id));
	}

	async deleteInvite(id: string): Promise<void> {
		await this.scope().delete(invites).where(eq(invites.id, id));
	}

	// ── thread_shares ─────────────────────────────────────────────────

	async addThreadShare(
		threadId: string,
		userId: string,
		role: "editor" | "viewer",
		invitedBy: string,
		inviteId?: string,
	): Promise<ThreadShare> {
		const [row] = await this.scope()
			.insert(threadShares)
			.values({
				id: ids.threadShare(),
				threadId,
				userId,
				role,
				invitedBy,
				inviteId: inviteId ?? null,
			})
			.onConflictDoNothing({
				target: [threadShares.threadId, threadShares.userId],
			})
			.returning();
		return row!;
	}

	async listThreadShares(threadId: string): Promise<ThreadShare[]> {
		return this.scope().query.threadShares.findMany({
			where: eq(threadShares.threadId, threadId),
		});
	}

	async getThreadShareRole(
		threadId: string,
		userId: string,
	): Promise<"editor" | "viewer" | undefined> {
		return (
			await this.scope().query.threadShares.findFirst({
				where: and(
					eq(threadShares.threadId, threadId),
					eq(threadShares.userId, userId),
				),
			})
		)?.role;
	}

	async removeThreadShare(threadId: string, userId: string): Promise<void> {
		await this.scope()
			.delete(threadShares)
			.where(
				and(
					eq(threadShares.threadId, threadId),
					eq(threadShares.userId, userId),
				),
			);
	}

	async removeThreadSharesByInvite(inviteId: string): Promise<void> {
		await this.scope()
			.delete(threadShares)
			.where(eq(threadShares.inviteId, inviteId));
	}
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function defaultExpiry(): Date {
	const date = new Date();
	date.setDate(date.getDate() + 7);
	return date;
}
