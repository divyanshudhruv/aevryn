import type { ChatMessage, Db } from "@aevryn/db";
import { chatMessages, db, ids } from "@aevryn/db";
import { asc, eq } from "drizzle-orm";

/**
 * Message persistence helper — THE single way user/assistant/system messages
 * are written and read, so the thread UI and both execution paths agree on
 * shape, statuses, and run linkage.
 */

export type MessageContent = Array<{ type: string; text?: string }>;

export class MessageService {
	constructor(private readonly client: Db = db) {}

	async saveUser(input: {
		threadId: string;
		userId: string;
		text: string;
		runId?: string;
	}): Promise<ChatMessage> {
		const [row] = await this.client
			.insert(chatMessages)
			.values({
				id: ids.chatMessage(),
				threadId: input.threadId,
				userId: input.userId,
				role: "user",
				status: "completed",
				runId: input.runId ?? null,
				content: [{ type: "text", text: input.text }] as never,
			})
			.returning();
		return row!;
	}

	async startAssistant(input: {
		threadId: string;
		userId: string;
		runId?: string;
	}): Promise<ChatMessage> {
		const [row] = await this.client
			.insert(chatMessages)
			.values({
				id: ids.chatMessage(),
				threadId: input.threadId,
				userId: input.userId,
				role: "assistant",
				status: "streaming",
				runId: input.runId ?? null,
				content: [] as never,
			})
			.returning();
		return row!;
	}

	async completeAssistant(
		id: string,
		content: MessageContent,
	): Promise<ChatMessage | undefined> {
		const [row] = await this.client
			.update(chatMessages)
			.set({ status: "completed", content: content as never })
			.where(eq(chatMessages.id, id))
			.returning();
		return row;
	}

	async failAssistant(id: string, errorText: string): Promise<ChatMessage | undefined> {
		const [row] = await this.client
			.update(chatMessages)
			.set({
				status: "failed",
				content: [{ type: "text", text: errorText }] as never,
			})
			.where(eq(chatMessages.id, id))
			.returning();
		return row;
	}

	async saveSystem(input: {
		threadId: string;
		userId: string;
		text: string;
	}): Promise<ChatMessage> {
		const [row] = await this.client
			.insert(chatMessages)
			.values({
				id: ids.chatMessage(),
				threadId: input.threadId,
				userId: input.userId,
				role: "system",
				status: "completed",
				content: [{ type: "text", text: input.text }] as never,
			})
			.returning();
		return row!;
	}

	async listByThread(threadId: string, limit = 200): Promise<ChatMessage[]> {
		return this.client.query.chatMessages.findMany({
			where: eq(chatMessages.threadId, threadId),
			orderBy: [asc(chatMessages.createdAt)],
			limit,
		});
	}
}

export const messageService = new MessageService();
