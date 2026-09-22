import type { Db } from "@aevryn/db";
import { db, decryptSecret, userKeys } from "@aevryn/db";
import { and, eq } from "drizzle-orm";
import { MemoryClient } from "mem0ai";

export interface MemoryItem {
	id: string;
	memory: string;
}

export class MemoryService {
	constructor(private readonly client: Db = db) {}

	private async mem0KeyFor(userId: string): Promise<string | null> {
		const [row] = await this.client
			.select({ encryptedValue: userKeys.encryptedValue })
			.from(userKeys)
			.where(and(eq(userKeys.userId, userId), eq(userKeys.name, "mem0")));
		return row ? decryptSecret(row.encryptedValue) : null;
	}

	async list(input: {
		userId: string;
		threadId: string;
	}): Promise<MemoryItem[]> {
		const key = await this.mem0KeyFor(input.userId);
		if (!key) {
			throw Object.assign(new Error("Add a Mem0 key in Settings → API keys."), {
				code: "NO_MEM0_KEY",
			});
		}
		const client = new MemoryClient({ apiKey: key });
		const { results } = await client.search("*", {
			filters: { user_id: input.threadId },
			topK: 50,
		});
		type Mem0Hit = { id?: string; memory?: unknown };
		return (results as Mem0Hit[])
			.map((m) => ({
				id: m.id ?? "",
				memory: typeof m.memory === "string" ? m.memory : "",
			}))
			.filter((m) => m.memory.length > 0);
	}

	async delete(input: { userId: string; memoryId: string }): Promise<void> {
		const key = await this.mem0KeyFor(input.userId);
		if (!key) {
			throw Object.assign(new Error("Add a Mem0 key in Settings → API keys."), {
				code: "NO_MEM0_KEY",
			});
		}
		const client = new MemoryClient({ apiKey: key });
		await client.delete(input.memoryId);
	}
}

export const memoryService = new MemoryService();
