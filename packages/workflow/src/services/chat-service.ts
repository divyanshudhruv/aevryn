import type {
	Db,
	Message,
	RunStatus,
	Step,
	StepToolCall,
	ToolCallLogInput,
	Workflow,
} from "@aevryn/db";
import {
	db,
	ids,
	messages,
	planSteps,
	steps,
	threads,
	toolCallLogs,
	workflows,
} from "@aevryn/db";
import type { UIMessage } from "ai";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

// ─── Plan binding (resume path) ───────────────────────────────────────────

/** Result of scanning a resume payload for a presentPlan decision that
 *  still needs its workflow bound. `bound-approved` marks an "Approve" (run
 *  now) decision — the route overrides the turn to run mode so execution
 *  starts immediately regardless of the client's transport mode (the client
 *  flips itself via the realtime status/binding broadcasts this turn emits). */
export type PlanBindResult =
	| { status: "no-decision" }
	| { status: "already-bound"; workflowId: string }
	| { status: "bound"; workflowId: string }
	| { status: "bound-approved"; workflowId: string };

/** Result of a run/stop request on a thread's bound workflow. */
export type RunControlResult =
	| { status: "stopped" }
	| { status: "ok" }
	| { status: "no-bound-workflow" }
	| { status: "already-running" };

export class ChatService {
	constructor(private readonly client: Db = db) {}

	// ─── Workflow / plan steps ────────────────────────────────────────────────

	async createWorkflowFromPlan(input: {
		userId: string;
		threadId: string;
		title: string;
		objective: string;
		summary?: string;
		steps: Array<{ title: string; description?: string }>;
	}): Promise<Workflow> {
		const workflowId = ids.workflow();

		await this.client.transaction(async (tx) => {
			const [threadRow] = await tx
				.select({ workspaceId: threads.workspaceId })
				.from(threads)
				.where(
					and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
				)
				.limit(1);
			if (!threadRow) {
				throw new Error(
					`Thread ${input.threadId} not found or not owned by user`,
				);
			}

			await tx.insert(workflows).values({
				id: workflowId,
				threadId: input.threadId,
				userId: input.userId,
				workspaceId: threadRow.workspaceId,
				title: input.title,
				objective: input.objective,
				status: "idle",
			});

			if (input.steps.length > 0) {
				await tx.insert(planSteps).values(
					input.steps.map((step, index) => ({
						id: ids.planStep(),
						workflowId,
						userId: input.userId,
						position: index + 1, // 1-based, matches updateStepStatus
						title: step.title,
						description: step.description ?? null,
						status: "idle" as const,
					})),
				);
			}

			await tx
				.update(threads)
				.set({ boundWorkflowId: workflowId })
				.where(
					and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
				);
		});

		const [row] = await this.client
			.select()
			.from(workflows)
			.where(eq(workflows.id, workflowId));
		return row!;
	}

	async updatePlanStepStatus(input: {
		userId: string;
		workflowId: string;
		position: number;
		status: RunStatus;
		note?: string;
	}): Promise<void> {
		await this.client
			.update(planSteps)
			.set({
				status: input.status,
				...(input.note ? { description: input.note } : {}),
			})
			.where(
				and(
					eq(planSteps.workflowId, input.workflowId),
					eq(planSteps.position, input.position),
					eq(planSteps.userId, input.userId),
				),
			);

		if (input.status === "completed") {
			const [counts] = await this.client
				.select({
					total: sql<number>`count(*)`.mapWith(Number),
					pending:
						sql<number>`count(*) filter (where status <> 'completed')`.mapWith(
							Number,
						),
				})
				.from(planSteps)
				.where(
					and(
						eq(planSteps.workflowId, input.workflowId),
						eq(planSteps.userId, input.userId),
					),
				);
			const hasSteps = (counts?.total ?? 0) > 0;
			const allDone = hasSteps && (counts?.pending ?? 0) === 0;
			if (allDone) {
				await this.setWorkflowStatus({
					userId: input.userId,
					workflowId: input.workflowId,
					status: "completed",
				});
			}
		}
	}

	/** Update thread metadata (title / group move). User-scoped → 404 via null
	 *  when the thread isn't found. */
	async updateThread(input: {
		threadId: string;
		userId: string;
		patch: { title?: string; groupId?: string | null };
	}): Promise<{ id: string; title: string } | null> {
		const [row] = await this.client
			.update(threads)
			.set(input.patch)
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			)
			.returning({ id: threads.id, title: threads.title });
		return row ?? null;
	}

	/**
	 * Marks a thread as wanting to run (or stop) its bound workflow. The stop
	 * path unwinds the workflow's in-flight plan steps too — otherwise the
	 * PlanStepsCard and the agent's step slider stay stuck on a mid-run state.
	 * Throws `{ code: "THREAD_NOT_FOUND" }` when the thread row is missing.
	 */
	async runControl(input: {
		threadId: string;
		userId: string;
		action: "run" | "stop";
	}): Promise<RunControlResult> {
		const [thread] = await this.client
			.select({
				id: threads.id,
				boundWorkflowId: threads.boundWorkflowId,
				status: threads.status,
			})
			.from(threads)
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			);
		if (!thread) {
			throw Object.assign(
				new Error(`Thread ${input.threadId} not found or not owned by user`),
				{ code: "THREAD_NOT_FOUND" },
			);
		}

		if (input.action === "stop") {
			await this.client.transaction(async (tx) => {
				await tx
					.update(threads)
					.set({ status: "idle" })
					.where(eq(threads.id, input.threadId));
				if (thread.boundWorkflowId) {
					await tx
						.update(planSteps)
						.set({ status: "idle" })
						.where(
							and(
								eq(planSteps.workflowId, thread.boundWorkflowId),
								inArray(planSteps.status, [
									"running",
									"retrying",
									"awaiting_approval",
									"sleeping",
								]),
							),
						);
				}
			});
			return { status: "stopped" };
		}

		if (!thread.boundWorkflowId) return { status: "no-bound-workflow" };

		// Run-race guard: two tabs POSTing /run concurrently both passed the
		// status read above and both would dispatch trigger messages → the
		// workflow double-executes. The transaction-scoped advisory lock keyed
		// to the thread serializes the check: the second caller re-reads the
		// status INSIDE the lock, so only one of the overlapping requests
		// returns "ok". (The lock covers the overlapping window; a status
		// write that has already landed still short-circuits via the check.)
		return this.client.transaction(async (tx) => {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${input.threadId}))`,
			);
			const [fresh] = await tx
				.select({ status: threads.status })
				.from(threads)
				.where(eq(threads.id, input.threadId));
			if (fresh?.status === "running") return { status: "already-running" };
			return { status: "ok" };
		});
	}

	async setWorkflowStatus(input: {
		workflowId: string;
		userId: string;
		status: RunStatus;
	}): Promise<void> {
		await this.client
			.update(workflows)
			.set({ status: input.status })
			.where(
				and(
					eq(workflows.id, input.workflowId),
					eq(workflows.userId, input.userId),
				),
			);
	}

	async setThreadStatus(input: {
		threadId: string;
		userId: string;
		status: RunStatus;
	}): Promise<void> {
		await this.client
			.update(threads)
			.set({ status: input.status })
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			);
	}

	async boundWorkflow(
		threadId: string,
		userId: string,
	): Promise<Workflow | null> {
		const [row] = await this.client
			.select()
			.from(workflows)
			.where(
				and(eq(workflows.threadId, threadId), eq(workflows.userId, userId)),
			)
			.orderBy(asc(workflows.createdAt));
		return row ?? null;
	}

	// ─── Messages + steps ─────────────────────────────────────────────────────

	async saveMessage(input: {
		userId: string;
		threadId: string;
		role: "user" | "assistant" | "system";
		content: string;
		/** Full UIMessage parts — persisted so replay restores tool cards,
		 *  QuestionFlow answers, plan decisions, and approvals exactly. */
		parts?: unknown[];
		/** Client draft id — idempotency key. A retried send re-uses the same
		 *  draft id until the server echo replaces it, so the persisted row's
		 *  (threadId, userId, clientMessageId) unique index turns the second
		 *  write into a conflict → the existing row is returned instead of a
		 *  duplicate. */
		clientMessageId?: string;
		usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
		steps?: Array<{
			position: number;
			text?: string;
			toolCalls: StepToolCall[];
		}>;
	}): Promise<Message> {
		await this.assertThreadOwned(input.threadId, input.userId);

		const messageId = ids.message();

		return this.client.transaction(async (tx) => {
			const [savedMessage] = await tx
				.insert(messages)
				.values({
					id: messageId,
					threadId: input.threadId,
					userId: input.userId,
					role: input.role,
					content: input.content,
					...(input.parts ? { parts: input.parts } : {}),
					...(input.clientMessageId
						? { clientMessageId: input.clientMessageId }
						: {}),
					usage: input.usage,
				})
				.onConflictDoNothing({
					target: [
						messages.threadId,
						messages.userId,
						messages.clientMessageId,
					],
				})
				.returning();

			if (!savedMessage) {
				// Conflict on the client idempotency key — this turn was already
				// persisted. Return the prior row; no thread bump, no step/log
				// writes (those happened on the first insert).
				// A unique-index conflict here can only mean a non-null clientMessageId
				// (NULLs can never conflict), so the key is present.
				const [existing] = await tx
					.select()
					.from(messages)
					.where(
						and(
							eq(messages.threadId, input.threadId),
							eq(messages.userId, input.userId),
							eq(messages.clientMessageId, input.clientMessageId!),
						),
					)
					.limit(1);
				return existing!;
			}

			await tx
				.update(threads)
				.set({ lastMessageAt: new Date() })
				.where(eq(threads.id, input.threadId));

			if (input.steps && input.steps.length > 0) {
				const insertedSteps = await tx
					.insert(steps)
					.values(
						input.steps.map((step) => ({
							id: ids.step(),
							messageId,
							threadId: input.threadId,
							userId: input.userId,
							position: step.position,
							text: step.text ?? null,
							toolCalls: step.toolCalls,
						})),
					)
					.returning();

				// One audit-log row per server tool call, keyed off the inserted
				// step rows (real step ids, not the input positions).
				const logRows: ToolCallLogInput[] = [];
				for (let stepIndex = 0; stepIndex < insertedSteps.length; stepIndex++) {
					const stepRow = insertedSteps[stepIndex];
					const step = input.steps[stepIndex];
					if (!stepRow || !step) continue;
					for (const call of step.toolCalls ?? []) {
						logRows.push({
							id: ids.toolCallLog(),
							messageId,
							threadId: input.threadId,
							stepId: stepRow.id,
							userId: input.userId,
							toolName: call.toolName,
							toolCallId: call.toolCallId,
							direction: "server",
							input: call.input ?? null,
							output: call.output ?? null,
							error: call.error ?? null,
							status: call.status ?? "completed",
							startedAt: call.startedAt ? new Date(call.startedAt) : new Date(),
							endedAt: call.endedAt ? new Date(call.endedAt) : null,
							durationMs:
								call.startedAt && call.endedAt
									? new Date(call.endedAt).getTime() -
										new Date(call.startedAt).getTime()
									: null,
							tokens: input.usage ?? null,
							chainStack: null,
						});
					}
				}
				if (logRows.length > 0) {
					await tx.insert(toolCallLogs).values(logRows);
				}
			}

			return savedMessage;
		});
	}

	// Client-tool resumes (askUser answers, plan decisions, approvals) log the
	// answer on the wire back from the client. The message id is unknown at
	// that point, so it uses a sentinel; the (message_id, tool_call_id) unique
	// index still keys each tool call to one row. A follow-up can migrate the
	// sentinel rows to real message ids.
	async logClientToolCall(input: {
		threadId: string;
		userId: string;
		toolName: string;
		toolCallId: string;
		output: unknown;
	}): Promise<void> {
		await this.client.insert(toolCallLogs).values({
			id: ids.toolCallLog(),
			messageId: null,
			threadId: input.threadId,
			stepId: null,
			userId: input.userId,
			toolName: input.toolName,
			toolCallId: input.toolCallId,
			direction: "client",
			input: null,
			output: input.output ?? null,
			error: null,
			status: "completed",
			startedAt: new Date(),
			endedAt: new Date(),
			durationMs: 0,
			tokens: null,
			chainStack: null,
		});
	}

	async loadThread(input: {
		threadId: string;
		userId: string;
		/** Fetch only the most recent N messages (newest wins; result stays
		 *  chronological). Omitted ↔ full history. */
		limit?: number;
	}): Promise<{
		messages: Message[];
		stepsByMessageId: Record<string, Step[]>;
	}> {
		const messagesQuery = this.client
			.select()
			.from(messages)
			.where(
				and(
					eq(messages.threadId, input.threadId),
					eq(messages.userId, input.userId),
				),
			);
		const messageRows =
			input.limit != null
				? await messagesQuery
						.orderBy(desc(messages.createdAt))
						.limit(input.limit)
				: await messagesQuery.orderBy(asc(messages.createdAt));
		// Limit kept a window of the newest; restore chronological order so
		// downstream renderers/prompt builders see oldest→newest as before.
		if (input.limit != null) {
			messageRows.reverse();
		}

		const stepRows = await this.client
			.select()
			.from(steps)
			.where(
				and(eq(steps.threadId, input.threadId), eq(steps.userId, input.userId)),
			)
			.orderBy(asc(steps.position));

		const stepsByMessageId: Record<string, Step[]> = {};
		// Every message gets a key (empty array when no steps) so the timeline
		// renderer can rely on stepsByMessageId[messageId] always existing.
		for (const message of messageRows) {
			stepsByMessageId[message.id] = [];
		}
		for (const step of stepRows) {
			(stepsByMessageId[step.messageId] ??= []).push(step);
		}

		return { messages: messageRows, stepsByMessageId };
	}

	// ─── Plan binding (resume path) ───────────────────────────────────────────

	/**
	 * Bind the approved/bound plan decision carried in a resume payload to a
	 * real workflow + plan steps. Runs after the client-tool answer has been
	 * logged but before the resumed agent loop starts. The decision arrives
	 * two ways — as an explicit body.toolAnswer, or merged into the client's
	 * messages array by useChat's auto-resume. Both are already reflected into
	 * `uiMessages` by the time this is called; this method scans the synced
	 * list for the answered presentPlan part that has not been bound yet.
	 *
	 * Idempotent: a thread that already has a bound workflow yields
	 * `already-bound` (an earlier resume processed it). Ownership is enforced
	 * before any write — a plan decision for a thread the user doesn't own
	 * must never bind a workflow into someone else's thread (IDOR). Throws
	 * `{ code: "THREAD_NOT_FOUND" }` when the thread row is missing.
	 */
	async bindPlanDecision(input: {
		userId: string;
		threadId: string;
		uiMessages: UIMessage[];
	}): Promise<PlanBindResult> {
		const presentPlanAnswers = input.uiMessages
			.flatMap((m) => m.parts as unknown as Array<Record<string, unknown>>)
			.filter(
				(p) =>
					p.type === "tool-presentPlan" &&
					p.state === "output-available" &&
					p.output != null &&
					typeof p.output === "object",
			)
			.map((p) => ({
				toolCallId: p.toolCallId as string | undefined,
				output: p.output as Record<string, unknown>,
				input: p.input as Record<string, unknown> | undefined,
			}));
		const unboundDecision = presentPlanAnswers.find(
			(a) =>
				(a.output.decision === "approved" || a.output.decision === "bound") &&
				a.output.workflowId == null,
		);
		if (!unboundDecision) return { status: "no-decision" };
		// "Approve" means run now; "Bind" means run later. The route turns
		// bound-approved resumes into run-mode turns (server-authoritative).
		const wantsRunNow = unboundDecision.output.decision === "approved";

		const [threadRow] = await this.client
			.select({ boundWorkflowId: threads.boundWorkflowId })
			.from(threads)
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			);
		if (!threadRow) {
			throw Object.assign(
				new Error(`Thread ${input.threadId} not found or not owned by user`),
				{ code: "THREAD_NOT_FOUND" },
			);
		}

		if (threadRow.boundWorkflowId) {
			this.reflectWorkflowId(
				input.uiMessages,
				unboundDecision.toolCallId,
				threadRow.boundWorkflowId,
			);
			// A re-sent "Approve" decision on an already-bound thread still
			// wants execution (the earlier resume may have raced the client's
			// mode flip and run in chat mode) — report it as bound-approved.
			return wantsRunNow
				? { status: "bound-approved", workflowId: threadRow.boundWorkflowId }
				: { status: "already-bound", workflowId: threadRow.boundWorkflowId };
		}

		const rawPlan = unboundDecision.input;
		if (
			rawPlan &&
			typeof rawPlan.title === "string" &&
			typeof rawPlan.objective === "string" &&
			Array.isArray(rawPlan.steps)
		) {
			const workflow = await this.createWorkflowFromPlan({
				userId: input.userId,
				threadId: input.threadId,
				title: rawPlan.title,
				objective: rawPlan.objective,
				...(typeof rawPlan.summary === "string"
					? { summary: rawPlan.summary }
					: {}),
				steps: rawPlan.steps as Array<{
					title: string;
					description?: string;
				}>,
			});
			// Reflect the binding on the decision AND the client message parts
			// so the resumed loop knows the workflow id (run mode uses it for
			// updateStepStatus) and no double-bind happens on the next resume.
			this.reflectWorkflowId(
				input.uiMessages,
				unboundDecision.toolCallId,
				workflow.id,
			);
			return wantsRunNow
				? { status: "bound-approved", workflowId: workflow.id }
				: { status: "bound", workflowId: workflow.id };
		}

		return { status: "no-decision" };
	}

	private reflectWorkflowId(
		uiMessages: UIMessage[],
		toolCallId: string | undefined,
		workflowId: string,
	): void {
		for (const m of uiMessages) {
			for (const p of m.parts as unknown as Array<Record<string, unknown>>) {
				if (
					p.type === "tool-presentPlan" &&
					p.toolCallId === toolCallId &&
					p.output != null &&
					typeof p.output === "object"
				) {
					(p.output as Record<string, unknown>).workflowId = workflowId;
				}
			}
		}
	}

	/**
	 * On resume, the client sends the authoritative message list with the tool
	 * output already merged in. Returns that list (sanitized) for the model
	 * loop, but persists only genuinely new user text turns that were never
	 * saved: assistant rows belong to the stream (saveMessage persists them
	 * server-side at stream end), and persisting transport snapshots back
	 * would overwrite the merged tool parts with stale client copies.
	 */
	async syncClientMessages(input: {
		threadId: string;
		userId: string;
		clientMessages: Array<{ id?: string; role: string; parts: unknown[] }>;
	}): Promise<UIMessage[]> {
		// Never trust a client-supplied persisted-looking id: a malicious
		// payload could claim someone else's `msg_` row (or an id this thread
		// has never seen) and the id-swap below would legitimize it. Collect
		// the `msg_` ids this thread ACTUALLY owns and strip the rest — a
		// claimed-but-unknown id is demoted to an anonymous draft (fresh
		// synthetic id) so it can never collide with a real row.
		const claimedIds = input.clientMessages
			.map((m) => m.id)
			.filter(
				(id): id is string => typeof id === "string" && id.startsWith("msg_"),
			);
		let ownedIds = new Set<string>();
		if (claimedIds.length > 0) {
			const owned = await this.client
				.select({ id: messages.id })
				.from(messages)
				.where(
					and(
						eq(messages.threadId, input.threadId),
						eq(messages.userId, input.userId),
						inArray(messages.id, claimedIds),
					),
				);
			ownedIds = new Set(owned.map((r: { id: string }) => r.id));
		}
		let anonCounter = 0;
		const nextAnonId = () => `local_${Date.now()}_anon${anonCounter++}`;

		// Dedupe by id while sanitizing — first occurrence wins. A duplicated
		// id in the transport payload (retried/auto-resumed sends mixing
		// persisted `msg_` rows with local drafts) must not emit two messages
		// with the same id: duplicated parts render as duplicate cards in the
		// timeline. Synthetic ids get an index suffix so same-millisecond
		// fallbacks can't collide either.
		const sanitized: UIMessage[] = [];
		const seenIds = new Set<string>();
		input.clientMessages.forEach((m, index) => {
			let id = m.id ?? `local_${Date.now()}_${index}`;
			if (id.startsWith("msg_") && !ownedIds.has(id)) {
				// Claimed id that isn't in this thread's DB history → not real.
				id = nextAnonId();
			}
			if (seenIds.has(id)) return;
			seenIds.add(id);
			sanitized.push({
				id,
				role: m.role as UIMessage["role"],
				parts: (m.parts as unknown[]).filter((p) => {
					const type = (p as { type?: string }).type;
					return type !== "reasoning" && type !== "reasoning-file";
				}) as UIMessage["parts"],
			});
		});

		// Persist only a never-before-seen user text turn. Skip messages we can
		// identify as already-persisted (real message ids) and id-less local
		// rows that only carry tool answers. Real network retries re-send the
		// same draft id, so passing it as the idempotency key lets saveMessage
		// skip turns already written (unique (threadId, userId, clientMessageId)).
		for (const m of sanitized) {
			if (m.role !== "user") continue;
			if (m.id.startsWith("msg_") || m.id.startsWith("local_")) continue;
			const text = (m.parts as Array<{ type?: string; text?: string }>)
				.filter((p) => p.type === "text" && typeof p.text === "string")
				.map((p) => p.text as string)
				.join("\n")
				.trim();
			if (!text) continue;

			const saved = await this.saveMessage({
				userId: input.userId,
				threadId: input.threadId,
				role: "user",
				content: text,
				parts: m.parts as unknown[],
				clientMessageId: m.id,
			});
			// The persisted row's id is the single source of truth. On a retried
			// draft saveMessage dedups against the unique index and returns the
			// prior row, so swap the draft id for the real one — callers that
			// look messages up by id get a stable handle. Never swap onto an id
			// another message in this list already holds (would duplicate).
			if (saved.id !== m.id && !seenIds.has(saved.id)) {
				seenIds.delete(m.id);
				seenIds.add(saved.id);
				m.id = saved.id;
			}
		}

		return sanitized;
	}

	/** Mark a failed turn with an in-thread error tile + `failed` thread status
	 *  so the failure survives refresh (a re-run triggers the retryAgent
	 *  repair). Never throws — failure persistence must not mask the original
	 *  streaming error. */
	async persistFailedTurn(input: {
		threadId: string;
		userId: string;
		text: string;
	}): Promise<void> {
		try {
			await this.saveMessage({
				userId: input.userId,
				threadId: input.threadId,
				role: "system",
				content: input.text,
				parts: [{ type: "system-message", variant: "error", text: input.text }],
			});
			await this.setThreadStatus({
				threadId: input.threadId,
				userId: input.userId,
				status: "failed",
			});
		} catch (persistErr) {
			console.error("[chat-service] failed-turn persistence error", persistErr);
		}
	}

	// ─── Internal ─────────────────────────────────────────────────────────────

	private async assertThreadOwned(
		threadId: string,
		userId: string,
	): Promise<void> {
		const [row] = await this.client
			.select({ id: threads.id })
			.from(threads)
			.where(and(eq(threads.id, threadId), eq(threads.userId, userId)))
			.limit(1);
		if (!row) {
			throw new Error(`Thread ${threadId} not found or not owned by user`);
		}
	}
}
