import {
	MemoryService,
	type MemoryCategory,
	type MemoryEntry,
	ThreadService,
} from "@aevryn/workflow";

const memoryService = new MemoryService();
const threadService = new ThreadService();

/**
 * Retrieve relevant long-term memory for the objective. When the run is a
 * bounded-recovery pass, prefer procedural memory so the agent reuses the
 * lesson from the prior failure. Returns null when no entries are found or
 * when the memory backend is offline (no env key configured).
 */
export async function retrieveRelevantMemory(
	input: {
		userId: string;
		workflowId?: string;
		threadId?: string;
		workspaceId?: string;
		query: string;
		preferProcedural?: boolean;
	},
): Promise<string | null> {
	try {
		const categories: MemoryCategory[] | undefined = input.preferProcedural
			? ["procedural"]
			: undefined;
		const entries: MemoryEntry[] = await memoryService.search({
			userId: input.userId,
			workflowId: input.workflowId,
			threadId: input.threadId,
			workspaceId: input.workspaceId,
			query: input.query,
			limit: 3,
			categories,
		});
		if (entries.length === 0) {
			return null;
		}
		const lines = entries.map(
			(entry) => `- [${entry.category}] ${entry.text}`,
		);
		return `Retrieved from long-term memory (use if relevant, ignore if stale):\n${lines.join("\n")}`;
	} catch {
		return null;
	}
}

/**
 * Record a completed run in episodic memory so future recall can draw on
 * prior successful runs. Fires-and-forgets: persistence failure must never
 * abort a run.
 */
export async function storeEpisodicMemory(input: {
	userId: string;
	workflowId?: string;
	threadId?: string;
	workspaceId?: string;
	runId: string;
	threadTitle: string;
	summary: string;
}): Promise<void> {
	try {
		await memoryService.store({
			userId: input.userId,
			workflowId: input.workflowId,
			threadId: input.threadId,
			workspaceId: input.workspaceId,
			executionId: input.runId,
			category: "episodic",
			text: `Completed run of "${input.threadTitle}". Result: ${input.summary}`.slice(
				0,
				4000,
			),
			metadata: { threadTitle: input.threadTitle },
		});
	} catch {
		// Memory persistence must never fail a run.
	}
}

/**
 * After a successful bounded recovery, record the winning strategy as
 * procedural memory so the next recovery pass (if any) can reuse it.
 */
export async function storeProceduralMemory(input: {
	userId: string;
	workflowId?: string;
	threadId?: string;
	workspaceId?: string;
	runId: string;
	threadTitle: string;
	recoveryContext: {
		attempt: number;
		failureCode?: string;
		failureMessage?: string;
	};
}): Promise<void> {
	try {
		await memoryService.store({
			userId: input.userId,
			workflowId: input.workflowId,
			threadId: input.threadId,
			workspaceId: input.workspaceId,
			executionId: input.runId,
			category: "procedural",
			text: `Recovery (attempt ${input.recoveryContext.attempt}) for "${input.threadTitle}" succeeded after ${input.recoveryContext.failureCode ?? "a failure"}: ${input.recoveryContext.failureMessage ?? "unknown error"}. The resumed run completed successfully.`.slice(
				0,
				4000,
			),
			metadata: {
				failureCode: input.recoveryContext.failureCode,
				threadTitle: input.threadTitle,
			},
		});
	} catch {
		// Memory persistence must never fail a run.
	}
}

/**
 * Build a compact conversation-history block from the thread's chat
 * messages. Newest messages come first; older ones are summarized and
 * omitted when the budget is exhausted.
 */
export async function getConversationContext(
	threadId: string,
	excludeRunId: string,
	maxChars = 6000,
): Promise<string | null> {
	const messages = await threadService.listMessagesByThread(threadId, 200);

	const turns: Array<{ prompt: string; answer: string }> = [];
	for (const message of messages) {
		if (message.runId === excludeRunId || message.role === "system") {
			continue;
		}
		const text = extractTextFromContent(message.content);
		if (!text) {
			continue;
		}
		if (message.role === "user") {
			turns.push({ prompt: text, answer: "" });
		} else if (turns.length > 0 && !turns[turns.length - 1]!.answer) {
			turns[turns.length - 1]!.answer =
				text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
		}
	}
	const validTurns = turns.filter((t) => t.prompt && t.answer);
	if (validTurns.length === 0) {
		return null;
	}
	const blocks: string[] = [];
	let used = 0;
	let omitted = 0;
	for (const turn of validTurns.reverse()) {
		const block = `user: ${turn.prompt}\nassistant: ${turn.answer}`;
		if (used + block.length > maxChars) {
			omitted += 1;
			continue;
		}
		blocks.push(block);
		used += block.length;
	}
	if (blocks.length === 0) {
		return null;
	}
	const header =
		omitted > 0
			? `Prior messages in this thread (${omitted} older message${omitted === 1 ? "" : "s"} summarized and omitted for space):`
			: "Prior messages in this thread:";
	return `${header}\n${blocks.join("\n\n")}`;
}

/**
 * Extract plain text from an AI SDK UIMessage-shaped content object.
 * Handles both the `{ parts: [...] }` format and plain-string content.
 */
function extractTextFromContent(content: unknown): string | null {
	if (content == null) {
		return null;
	}
	if (typeof content === "string") {
		return content || null;
	}
	const record = content as Record<string, unknown>;
	const parts = record.parts as Array<{ type?: string; text?: string }> | undefined;
	if (Array.isArray(parts)) {
		return parts
			.filter(
				(p) => p.type === "text" && typeof p.text === "string" && p.text,
			)
			.map((p) => p.text)
			.join(" ") || null;
	}
	if (typeof record.text === "string") {
		return record.text || null;
	}
	return null;
}