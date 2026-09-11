import { type Db, db, workflows } from "@aevryn/db";
import { eq } from "drizzle-orm";
import { Mem0MemoryStore } from "../memory/mem0-store";
import type {
	MemoryCategory,
	MemoryEntry,
	SearchMemoryInput,
	StoreMemoryInput,
} from "../memory/types";
import { KeyService } from "./key-service";

/**
 * User-scoped memory backend, resolved through the key vault.
 *
 * Every mem0 call is scoped to the exact user id, so memory can never leak
 * across users. A single store is cached per (workspaceId, userId) pair —
 * "ONE store per user" — and memories carry workflow/thread metadata so the
 * agent can scope recall to a chat thread. When no mem0 key is configured
 * (either in the vault or env), the backend degrades to a null store: saves
 * no-op, search returns nothing, so an undeployed memory integration never
 * breaks a run.
 */
export class MemoryService {
	private readonly stores = new Map<string, Mem0MemoryStore>();

	constructor(
		private readonly client: Db = db,
		private readonly keys = new KeyService(client),
	) {}

	private cacheKey(workspaceId: string, userId: string): string {
		return `${workspaceId}:${userId}`;
	}

	private async storeFor(
		workspaceId: string,
		userId: string,
	): Promise<Mem0MemoryStore> {
		const key = this.cacheKey(workspaceId, userId);
		let store = this.stores.get(key);
		if (!store) {
			const resolved = await this.keys.resolveKey(workspaceId, userId, "mem0");
			store = new Mem0MemoryStore(resolved.key ?? "");
			this.stores.set(key, store);
		}
		return store;
	}

	async resolveWorkspaceId(workflowId: string): Promise<string | undefined> {
		const workflow = await this.client.query.workflows.findFirst({
			where: eq(workflows.id, workflowId),
			columns: { workspaceId: true },
		});
		return workflow?.workspaceId;
	}

	async store(
		input: StoreMemoryInput & {
			workspaceId?: string;
			workflowId?: string;
			threadId?: string;
		},
	): Promise<{ id: string }> {
		const resolvedWorkspaceId =
			input.workspaceId ??
			(input.workflowId
				? await this.resolveWorkspaceId(input.workflowId)
				: undefined);
		if (!resolvedWorkspaceId) {
			return { id: "mem_offline" };
		}
		const store = await this.storeFor(resolvedWorkspaceId, input.userId);
		return store.store({
			userId: input.userId,
			text: input.text,
			category: input.category ?? "semantic",
			workflowId: input.workflowId,
			executionId: input.executionId,
			metadata: {
				...input.metadata,
				...(input.threadId ? { threadId: input.threadId } : {}),
				workspaceId: resolvedWorkspaceId,
			},
		});
	}

	async search(
		input: SearchMemoryInput & {
			workspaceId?: string;
			workflowId?: string;
			threadId?: string;
		},
	): Promise<MemoryEntry[]> {
		const resolvedWorkspaceId =
			input.workspaceId ??
			(input.workflowId
				? await this.resolveWorkspaceId(input.workflowId)
				: undefined);
		if (!resolvedWorkspaceId) {
			return [];
		}
		const store = await this.storeFor(resolvedWorkspaceId, input.userId);
		const entries = await store.search({
			userId: input.userId,
			query: input.query,
			limit: input.limit,
			categories: input.categories,
			threshold: input.threshold,
		});
		if (input.threadId) {
			return entries.filter((entry) => {
				const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
				return metadata.threadId === input.threadId;
			});
		}
		return entries;
	}

	async listForUser(input: {
		workspaceId: string;
		userId: string;
		threadId?: string;
		limit?: number;
	}): Promise<MemoryEntry[]> {
		const store = await this.storeFor(input.workspaceId, input.userId);
		const entries = await store.listForUser({
			userId: input.userId,
			limit: (input.limit ?? 50) * 2,
		});
		if (!input.threadId) {
			return entries.slice(0, input.limit ?? 50);
		}
		return entries
			.filter((entry) => {
				const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
				return metadata.threadId === input.threadId;
			})
			.slice(0, input.limit ?? 50);
	}

	async deleteByIds(
		workspaceId: string,
		userId: string,
		idsToDelete: string[],
	): Promise<void> {
		const store = await this.storeFor(workspaceId, userId);
		await store.deleteByIds(userId, idsToDelete);
	}

	async deleteAllForUser(workspaceId: string, userId: string): Promise<void> {
		const store = await this.storeFor(workspaceId, userId);
		await store.deleteAllForUser(userId);
	}
}

export const memoryService = new MemoryService();

// Re-exported for type imports in callers.
export type { MemoryCategory, MemoryEntry };
