import { type Memory, MemoryClient } from "mem0ai";

import {
	type MemoryCategory,
	type MemoryEntry,
	type MemoryStore,
	memoryCategorySchema,
	type SearchMemoryInput,
	type StoreMemoryInput,
} from "./types";

function toMemoryEntry(memory: Memory): MemoryEntry {
	const metadata = (memory.metadata ?? {}) as Record<string, unknown>;
	const category = metadata.category as MemoryCategory | undefined;
	return {
		id: memory.id,
		text: memory.memory ?? "",
		category: memoryCategorySchema.safeParse(category).success
			? (category as MemoryCategory)
			: "semantic",
		createdAt: memory.createdAt?.toISOString() ?? new Date().toISOString(),
		score: memory.score,
		metadata,
	};
}

/**
 * Mem0-hosted memory backend. Ownership is enforced through the exact mem0
 * user id: every store/search/list is scoped to the workflow owner's id, so no
 * memory can ever leak across users.
 *
 * When no API key is configured the store degrades to a null backend: store
 * succeeds silently and search/list return nothing, so an undeployed memory
 * integration never breaks an execution.
 */
export class Mem0MemoryStore implements MemoryStore {
	private readonly client: MemoryClient | null;

	constructor(apiKey: string) {
		this.client = apiKey ? new MemoryClient({ apiKey }) : null;
	}

	async store(input: StoreMemoryInput): Promise<{ id: string }> {
		if (!this.client) {
			return { id: "mem_offline" };
		}
		const results = await this.client.add(
			[{ role: "user", content: input.text }],
			{
				userId: input.userId,
				infer: false,
				metadata: {
					category: input.category ?? "semantic",
					workflowId: input.workflowId,
					executionId: input.executionId,
					...input.metadata,
				},
			},
		);
		const memory = results[0];
		return { id: memory?.id ?? "mem_ok" };
	}

	async search(input: SearchMemoryInput): Promise<MemoryEntry[]> {
		if (!this.client) {
			return [];
		}
		const allowed = input.categories
			? new Set<MemoryCategory>(input.categories)
			: null;
		const { results } = await this.client.search(input.query, {
			filters: { user_id: input.userId },
			topK: input.limit ?? 5,
			threshold: input.threshold,
		});
		return results
			.map(toMemoryEntry)
			.filter((entry) => !allowed || allowed.has(entry.category))
			.slice(0, input.limit ?? 5);
	}

	async listForUser(input: {
		userId: string;
		limit?: number;
	}): Promise<MemoryEntry[]> {
		if (!this.client) {
			return [];
		}
		const { results } = await this.client.getAll({
			filters: { user_id: input.userId },
			page: 1,
			pageSize: input.limit ?? 20,
		});
		return results.map(toMemoryEntry).slice(0, input.limit ?? 20);
	}

	async deleteAllForUser(userId: string): Promise<void> {
		if (!this.client) {
			return;
		}
		await this.client.deleteAll({ userId });
	}
}
