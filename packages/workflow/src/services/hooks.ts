import type { Db } from "@aevryn/db";
import { db } from "@aevryn/db";
import { and, eq } from "drizzle-orm";
import { runs, schedules, threadWorkflowBindings } from "@aevryn/db";
import { MemoryService } from "./memory-service";
import { PromptAssembler } from "./prompt-assembler";

/**
 * Feature hooks — one place that decides, shared by the chat HTTP path and
 * the durable runner:
 *   - does an action need approval?
 *   - should memory be recalled / stored?
 *   - should a schedule be created or checked?
 *   - should incoming work be queued (thread busy)?
 */

export class Hooks {
	private readonly assembler: PromptAssembler;
	private readonly memory: MemoryService;

	constructor(
		private readonly client: Db = db,
		assembler?: PromptAssembler,
		memory?: MemoryService,
	) {
		this.assembler = assembler ?? new PromptAssembler(client);
		this.memory = memory ?? new MemoryService(client);
	}

	// ── approval ────────────────────────────────────────────────────────

	async shouldAutoApprove(input: {
		workspaceId: string;
		threadId?: string;
		actionClass: string;
	}): Promise<boolean> {
		const settings = await this.assembler.loadSettings({
			workspaceId: input.workspaceId,
			threadId: input.threadId,
		});
		return settings.autoApproveClasses.includes(input.actionClass);
	}

	// ── memory ──────────────────────────────────────────────────────────

	async recallMemory(input: {
		workspaceId: string;
		userId: string;
		threadId?: string;
		query: string;
		limit?: number;
	}): Promise<string[]> {
		const entries = await this.memory.search({
			userId: input.userId,
			query: input.query,
			limit: input.limit ?? 5,
			threadId: input.threadId,
			workspaceId: input.workspaceId,
		});
		return entries.map((entry) => entry.text);
	}

	async storeMemory(input: {
		workspaceId: string;
		userId: string;
		threadId?: string;
		runId?: string;
		text: string;
	}): Promise<boolean> {
		const result = await this.memory.store({
			userId: input.userId,
			text: input.text,
			category: "semantic",
			workflowId: undefined,
			executionId: input.runId,
			threadId: input.threadId,
			workspaceId: input.workspaceId,
		});
		return result.id !== "mem_offline";
	}

	// ── schedule ────────────────────────────────────────────────────────

	async getThreadSchedule(threadId: string) {
		return this.client.query.schedules.findFirst({
			where: eq(schedules.threadId, threadId),
		});
	}

	async isScheduleDue(threadId: string, now = new Date()): Promise<boolean> {
		const schedule = await this.getThreadSchedule(threadId);
		return Boolean(
			schedule && schedule.enabled && schedule.nextRunAt && schedule.nextRunAt <= now,
		);
	}

	// ── queue / backpressure ────────────────────────────────────────────

	/** True when the thread's latest run is still active → queue new work. */
	async isThreadBusy(threadId: string): Promise<boolean> {
		const [latest] = await this.client.query.runs.findMany({
			where: eq(runs.threadId, threadId),
			orderBy: [runs.createdAt],
			limit: 1,
		});
		if (!latest) return false;
		return latest.status === "running" || latest.status === "awaiting_approval";
	}

	/** Bound workflow for the thread, if any (for context/plan work). */
	async getBoundWorkflowId(threadId: string): Promise<string | null> {
		const [binding] = await this.client
			.select({ workflowId: threadWorkflowBindings.workflowId })
			.from(threadWorkflowBindings)
			.where(
				and(eq(threadWorkflowBindings.threadId, threadId)),
			)
			.limit(1);
		return binding?.workflowId ?? null;
	}
}

export const hooks = new Hooks();
