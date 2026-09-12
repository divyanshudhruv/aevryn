import { db, chatMessages, ids, runs, type ChatMessage, type Db, type DbTx } from "@aevryn/db";
import { and, asc, desc, eq, max } from "drizzle-orm";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export interface EnqueueInput {
	threadId: string;
	userId: string;
	text: string;
}

export class QueueService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async listQueued(threadId: string): Promise<ChatMessage[]> {
		return this.scope().query.chatMessages.findMany({
			where: and(
				eq(chatMessages.threadId, threadId),
				eq(chatMessages.status, "queued"),
			),
			orderBy: [asc(chatMessages.queueOrder), asc(chatMessages.createdAt)],
		});
	}

	async enqueue(input: EnqueueInput): Promise<ChatMessage> {
		return this.scope().transaction(async (tx) => {
			const maxRow = await tx
				.select({ value: max(chatMessages.queueOrder) })
				.from(chatMessages)
				.where(
					and(
						eq(chatMessages.threadId, input.threadId),
						eq(chatMessages.status, "queued"),
					),
				);
			const nextOrder = (maxRow[0]?.value ?? -1) + 1;
			const [row] = await tx
				.insert(chatMessages)
				.values({
					id: ids.chatMessage(),
					threadId: input.threadId,
					userId: input.userId,
					role: "user",
					status: "queued",
					queueOrder: nextOrder,
					content: [{ type: "text", text: input.text }] as never,
				})
				.returning();
			return row!;
		});
	}

	async findById(id: string): Promise<ChatMessage | undefined> {
		return this.scope().query.chatMessages.findFirst({
			where: eq(chatMessages.id, id),
		});
	}

	async updateContent(id: string, text: string): Promise<ChatMessage | undefined> {
		const [row] = await this.scope()
			.update(chatMessages)
			.set({ content: [{ type: "text", text }] as never })
			.where(
				and(eq(chatMessages.id, id), eq(chatMessages.status, "queued")),
			)
			.returning();
		return row;
	}

	async remove(id: string): Promise<ChatMessage | undefined> {
		const [row] = await this.scope()
			.delete(chatMessages)
			.where(
				and(eq(chatMessages.id, id), eq(chatMessages.status, "queued")),
			)
			.returning();
		return row;
	}

	async reorder(threadId: string, orderedIds: string[]): Promise<void> {
		await this.scope().transaction(async (tx) => {
			for (const [index, messageId] of orderedIds.entries()) {
				await tx
					.update(chatMessages)
					.set({ queueOrder: index })
					.where(
						and(
							eq(chatMessages.id, messageId),
							eq(chatMessages.threadId, threadId),
							eq(chatMessages.status, "queued"),
						),
					);
			}
		});
	}

	/**
	 * Atomically pop the oldest queued message (status -> completed, so it reads
	 * as a normal user message again) and return it. The caller then starts a
	 * fresh run for the thread. Returns undefined when the queue is empty.
	 */
	async deliverNext(threadId: string): Promise<ChatMessage | undefined> {
		return this.scope().transaction(async (tx: DbTx) => {
			const [queued] = await tx
				.select()
				.from(chatMessages)
				.where(
					and(
						eq(chatMessages.threadId, threadId),
						eq(chatMessages.status, "queued"),
					),
				)
				.orderBy(asc(chatMessages.queueOrder), asc(chatMessages.createdAt))
				.limit(1);
			if (!queued) {
				return undefined;
			}
			const [row] = await tx
				.update(chatMessages)
				.set({ status: "completed" })
				.where(eq(chatMessages.id, queued.id))
				.returning();
			return row ?? undefined;
		});
	}

	/**
	 * True when the thread's most recent run has not yet reached a terminal
	 * state. Use it to decide between queueing a new message and running it now.
	 */
	async hasActiveRun(threadId: string): Promise<boolean> {
		const [latest] = await this.scope().query.runs.findMany({
			where: eq(runs.threadId, threadId),
			orderBy: [desc(runs.createdAt)],
			limit: 1,
		});
		return latest ? !TERMINAL.has(latest.status) : false;
	}
}