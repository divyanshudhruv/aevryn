import { chatMessages, db, ids, threads, type ChatMessage, type Db, type DbTx, type NewChatMessage, type Thread } from "@aevryn/db";
import { and, asc, eq, isNotNull, isNull, lt } from "drizzle-orm";

export interface CreateThreadInput {
	workspaceId: string;
	userId: string;
	groupId?: string;
	title?: string;
}

const AUTO_TITLE_CHARS = 60;

export class ThreadService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async create(input: CreateThreadInput): Promise<Thread> {
		const [row] = await this.scope()
			.insert(threads)
			.values({
				id: ids.thread(),
				workspaceId: input.workspaceId,
				userId: input.userId,
				groupId: input.groupId ?? null,
				title: input.title ?? "",
			})
			.returning();
		return row!;
	}

	async findById(id: string): Promise<Thread | undefined> {
		return this.scope().query.threads.findFirst({
			where: eq(threads.id, id),
		});
	}

	async listByWorkspace(
		workspaceId: string,
		limit = 100,
	): Promise<Thread[]> {
		return this.scope().query.threads.findMany({
			where: and(
				eq(threads.workspaceId, workspaceId),
				isNull(threads.deletedAt),
			),
			orderBy: [asc(threads.lastMessageAt), asc(threads.createdAt)],
			limit,
		});
	}

	async listByGroup(groupId: string): Promise<Thread[]> {
		return this.scope().query.threads.findMany({
			where: and(eq(threads.groupId, groupId), isNull(threads.deletedAt)),
			orderBy: [asc(threads.createdAt)],
		});
	}

	async listDeletedOlderThan(olderThanDays: number): Promise<Thread[]> {
		const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
		return this.scope().query.threads.findMany({
			where: and(isNotNull(threads.deletedAt), lt(threads.deletedAt, cutoff)),
		});
	}

	async listMessagesByThread(
		threadId: string,
		limit = 200,
	): Promise<ChatMessage[]> {
		return this.scope().query.chatMessages.findMany({
			where: eq(chatMessages.threadId, threadId),
			orderBy: [asc(chatMessages.createdAt)],
			limit,
		});
	}

	async updateMessage(
		id: string,
		patch: Pick<Partial<NewChatMessage>, "status" | "content" | "runId">,
	): Promise<ChatMessage | undefined> {
		const [row] = await this.scope()
			.update(chatMessages)
			.set(patch)
			.where(eq(chatMessages.id, id))
			.returning();
		return row;
	}

	/**
	 * Append a role=system line to the thread's visible chat history. System
	 * messages are how the UI learns about lifecycle events (a run sleeping,
	 * waiting for a webhook, or being stopped) without fabricating assistant
	 * text.
	 */
	async insertSystemMessage(
		threadId: string,
		userId: string,
		text: string,
	): Promise<ChatMessage | undefined> {
		const [row] = await this.scope()
			.insert(chatMessages)
			.values({
				id: ids.chatMessage(),
				threadId,
				userId,
				role: "system",
				status: "completed",
				content: [{ type: "text", text }] as never,
			})
			.returning();
		return row;
	}

	async rename(id: string, title: string): Promise<Thread | undefined> {
		const [row] = await this.scope()
			.update(threads)
			.set({ title })
			.where(eq(threads.id, id))
			.returning();
		return row;
	}

	async autoTitle(
		id: string,
		fromMessage: string,
	): Promise<Thread | undefined> {
		const trimmed = fromMessage.trim();
		if (!trimmed) {
			return this.findById(id);
		}
		const title =
			trimmed.length > AUTO_TITLE_CHARS
				? `${trimmed.slice(0, AUTO_TITLE_CHARS)}…`
				: trimmed;
		return this.rename(id, title);
	}

	async softDelete(id: string): Promise<Thread | undefined> {
		const [row] = await this.scope()
			.update(threads)
			.set({ deletedAt: new Date() })
			.where(eq(threads.id, id))
			.returning();
		return row;
	}

	async restore(id: string): Promise<Thread | undefined> {
		const [row] = await this.scope()
			.update(threads)
			.set({ deletedAt: null })
			.where(eq(threads.id, id))
			.returning();
		return row;
	}

	async bindWorkflow(
		id: string,
		workflowId: string,
	): Promise<Thread | undefined> {
		const [row] = await this.scope()
			.update(threads)
			.set({ boundWorkflowId: workflowId })
			.where(eq(threads.id, id))
			.returning();
		return row;
	}

	async unbindWorkflow(id: string): Promise<Thread | undefined> {
		const [row] = await this.scope()
			.update(threads)
			.set({ boundWorkflowId: null })
			.where(eq(threads.id, id))
			.returning();
		return row;
	}

	async touchLastMessage(id: string, at = new Date()): Promise<void> {
		await this.scope()
			.update(threads)
			.set({ lastMessageAt: at })
			.where(eq(threads.id, id));
	}

	async hardDelete(id: string, tx?: DbTx): Promise<void> {
		const client = tx ?? this.client;
		await client.delete(threads).where(eq(threads.id, id));
	}
}