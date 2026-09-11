import { db, ids, threads, type Db, type Thread, type DbTx } from "@aevryn/db";
import { and, asc, eq, isNull } from "drizzle-orm";

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

	async setShareEnabled(
		id: string,
		shareEnabled: boolean,
	): Promise<Thread | undefined> {
		const [row] = await this.scope()
			.update(threads)
			.set({ shareEnabled })
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