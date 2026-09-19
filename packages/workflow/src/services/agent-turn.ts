import { createStreamRetryFlags, MAX_PROVIDER_REPLAYS } from "@aevryn/agent";
import type { RunStatus, StepToolCall, Workflow } from "@aevryn/db";
import type { UIMessage } from "ai";

import type { ChatService } from "./chat-service";

const FAILED_TURN_TEXT =
	'The generation failed mid-run and this turn was cut off. Re-run the thread or reply "continue" to pick back up.';

// Tile text when the turn ended because tool calls failed (invalid tool
// schema rejected by the SDK, tool threw after retries) while the loop
// itself finished "normally". Shows the last error so the user can act.
const FAILED_TURN_TOOL_ERRORS_PREFIX =
	"Tool calls failed during this turn — the result may be incomplete. Last error: ";

// Recovery affordance (B7): with streamRetries disabled, a provider blip
// fails the whole turn, and the failure digest already persists what
// completed. Naming the last completed step in the tile turns "re-run
// everything" into "resume from where it stopped" — the repair prompt
// (buildInstructions, retryAfterFailure) already instructs the model not
// to restart earlier steps.
const RESUME_HINT_PREFIX = " Completed so far: ";

// Tile text (warning variant) when the anti-doubling loop guard fired: the
// turn ended EARLY on purpose, so the answer appears once instead of twice.
const LOOP_GUARD_TILE_PREFIX =
	"This turn was stopped early to avoid repeating itself — ";

// ─── Stream-retry text collapse ──────────────────────────────────────
// When the SDK's stream retry fires, the message ends up with TWO closed
// text parts: attempt 1's partial text and attempt 2's (overlapping) text.
// Collapse consecutive text parts where the earlier text is a prefix of (or
// contained in) the later one — only invoked when a retry actually happened.

function textPartsText(parts: UIMessage["parts"]): string {
	return parts
		.filter((p) => (p as { type?: string }).type === "text")
		.map((p) => (p as { text?: string }).text ?? "")
		.join("\n");
}

function collapseRetriedTextParts(
	parts: UIMessage["parts"],
): UIMessage["parts"] {
	const out: UIMessage["parts"] = [];
	for (const part of parts) {
		const prev = out.at(-1);
		if (prev?.type === "text" && part.type === "text") {
			const prevText = (prev as { text: string }).text;
			const nextText = (part as { text: string }).text;
			// Attempt-1 text fully contained in attempt-2 text → keep the later
			// (it's the superset). Equal texts collapse too (containment holds).
			if (nextText.includes(prevText) || prevText.includes(nextText)) {
				(out.at(-1) as { text: string }).text =
					nextText.length >= prevText.length ? nextText : prevText;
				continue;
			}
		}
		out.push(part);
	}
	return out;
}

// ─── Failure digest ───────────────────────────────────────────────────────────
// When a turn dies mid-loop (provider credits, abort, error), the model's
// only knowledge of its tool calls lived in that turn's tool parts — which
// pruneModelHistory strips before the next request. Persisting a compact
// digest as a *text* part on the assistant message keeps the breadcrumbs
// model-visible: text parts survive history pruning, tool parts don't.

// Per-tool output budget in the digest (chars). Big scrapes are truncated;
// the goal is "enough to answer about it", not a full replay.
const DIGEST_TOOL_OUTPUT_CHARS = 600;
// Total digest ceiling so a 30-tool run can't blow Groq's 8k TPM on its own.
const DIGEST_MAX_CHARS = 4000;

interface ToolExecutionRecord {
	toolName: string;
	input: unknown;
	startedAt: string;
}

interface ToolResultRecord {
	status: "running" | "completed" | "failed";
	output?: unknown;
}

function buildFailureDigest(
	toolExecutions: Map<string, ToolExecutionRecord>,
	toolResults: Map<string, ToolResultRecord>,
): string | null {
	if (toolExecutions.size === 0) return null;

	const lines: string[] = [];
	let total = 0;

	for (const [callId, exec] of toolExecutions) {
		const result = toolResults.get(callId);
		const status = result?.status ?? "running";
		const mark = status === "completed" ? "✓" : status === "failed" ? "✗" : "…";
		const inputStr = JSON.stringify(exec.input ?? null);
		const inputPreview =
			inputStr.length > 150 ? `${inputStr.slice(0, 150)}…` : inputStr;

		let outputPreview = "";
		if (result?.output != null) {
			const outputStr =
				typeof result.output === "string"
					? result.output
					: JSON.stringify(result.output);
			outputPreview =
				outputStr.length > DIGEST_TOOL_OUTPUT_CHARS
					? `${outputStr.slice(0, DIGEST_TOOL_OUTPUT_CHARS)}… [truncated]`
					: outputStr;
		}

		const line = `- ${mark} ${exec.toolName}(${inputPreview})${
			outputPreview
				? ` → ${outputPreview}`
				: status === "running"
					? " → (never finished)"
					: " → (no output)"
		}`;

		// Respect the total ceiling: stop adding lines rather than emitting a
		// half-truncated blob.
		if (total + line.length > DIGEST_MAX_CHARS) {
			lines.push(
				`- … (${toolExecutions.size - lines.length} more tool calls omitted)`,
			);
			break;
		}
		lines.push(line);
		total += line.length;
	}

	return [
		"[Work completed before this turn was cut off — these tool results are real and can be cited, but they were NOT included in the conversation.]",
		...lines,
	].join("\n");
}

// A client tool part is "pending" when its stream halted with the question /
// plan / approval still unanswered — the thread must sit in awaiting_approval
// so the sidebar/header keep showing run state. presentPlan and askUser halt
// the stream with state "input-available"; native approvals (wireAction etc.)
// use "approval-requested".
function hasPendingClientTool(responseMessage: UIMessage | undefined): boolean {
	return (responseMessage?.parts ?? []).some((p) => {
		if (typeof p !== "object" || p === null || !("state" in p)) return false;
		const type = String((p as { type?: string }).type ?? "");
		const state = (p as { state?: string }).state;
		if (!type.startsWith("tool-")) return false;
		if (state === "output-available" || state === "output-error") return false;
		return (
			type.startsWith("tool-askUser") ||
			type.startsWith("tool-presentPlan") ||
			state === "approval-requested"
		);
	});
}

export interface TurnLifecycleOptions {
	chat: ChatService;
	userId: string;
	threadId: string;
	mode: "chat" | "run";
	boundWorkflow: Workflow | null;
	/** Abort signal of the HTTP request (client Stop / disconnect / tab close). */
	signal?: AbortSignal | null;
	/** Fire-and-forget hook run after a successful (non-failed, non-aborted)
	 *  turn — the service uses it for deferred thread auto-titling. */
	onTurnCompleted?: () => void;
}

/**
 * Owns everything that happens to ONE agent turn between "stream started"
 * and "turn persisted": the deduped/serialized thread-status queue, the
 * tool-call/step accumulators the SDK callbacks feed, the anti-doubling
 * guard bookkeeping, and the single persistence point (assistant message +
 * parts + steps + failure digest + error/loop-guard tiles + terminal thread
 * status + workflow state).
 */
export class TurnLifecycle {
	private readonly chat: ChatService;
	private readonly userId: string;
	private readonly threadId: string;
	private readonly mode: "chat" | "run";
	private readonly boundWorkflow: Workflow | null;
	private readonly signal: AbortSignal | null | undefined;
	private readonly onTurnCompleted?: () => void;

	// Silent-retry visibility: the SDK's stream retry re-runs a step after
	// a provider error without any callback the service layer could use —
	// this flag rides in via onProviderRetry so the persisted turn can say so.
	private readonly retryFlags = createStreamRetryFlags();

	// Thread status writes are serialized and deduped: mid-run tool failures
	// flip "running" → "retrying" → "running" via the stream callbacks without
	// spamming the DB/realtime channel, and the fire-and-forget writes can't
	// land out of order (the terminal onEnd awaits the tail of the queue).
	private lastSetStatus: RunStatus | null = null;
	private statusQueue: Promise<void> = Promise.resolve();

	// Lifecycle accumulators (AI SDK group A-3 callbacks feed these).
	private readonly toolExecutions = new Map<string, ToolExecutionRecord>();
	private readonly toolResults = new Map<string, ToolResultRecord>();
	private readonly stepSnapshots: Array<{
		position: number;
		text: string;
		toolCalls: StepToolCall[];
	}> = [];
	// Filled by the agent-level onEnd; consumed by the UIMessage-stream
	// onEnd below (which fires later and owns final persistence).
	private finalUsage = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};
	// Filled by the agent-level onEnd (which has finishReason); consumed by
	// finishTurn to flip the thread to `failed`/`idle`.
	private streamFailed = false;
	private streamAborted = false;
	// Tool-level failures (invalid tool schema rejected by the SDK, tool
	// threw after SDK retries). The turn can still end with finishReason
	// "stop", so these are counted to surface an error tile that would
	// otherwise never appear.
	private toolErrorCount = 0;
	private lastToolError: string | null = null;
	// Anti-doubling bookkeeping. The loop guards (replayedStepGuardStop /
	// attemptReplayGuardStop) stop the loop deterministically; this mirrors
	// their conditions over the same step snapshots so the service layer can
	// tell the user WHY the turn ended ("the same call failed twice").
	private providerErrorSteps = 0;
	private stoppedByGuard: string | null = null;
	// Inputs of tool calls that errored in earlier steps — an identical
	// error in a later step means the model re-fired a failing call and the
	// turn is repeating itself.
	private readonly identicalToolErrorInputs = new Set<string>();

	// finishTurn is called from BOTH the stream's onEnd (normal path — full
	// message, parts, client-tool answers) and the agent-level onEnd when the
	// request was aborted or the loop died: the response stream can be torn
	// down before its own onEnd fires, so the "finally"-style early call
	// guarantees the turn still lands in the DB. `turnPersisted` makes the
	// first caller win (no double assistant message); terminal setStatus
	// writes are deduped/serialized, so a raced second call settles to the
	// same state.
	private turnPersisted = false;

	constructor(options: TurnLifecycleOptions) {
		this.chat = options.chat;
		this.userId = options.userId;
		this.threadId = options.threadId;
		this.mode = options.mode;
		this.boundWorkflow = options.boundWorkflow;
		this.signal = options.signal;
		this.onTurnCompleted = options.onTurnCompleted;
	}

	/** Latest token usage reported by the agent-level onEnd (zeroes until it
	 *  fires — the UIMessage metadata path falls back to it). */
	get usage(): {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	} {
		return this.finalUsage;
	}

	setStatus(status: RunStatus): Promise<void> {
		if (status === this.lastSetStatus) return this.statusQueue;
		this.lastSetStatus = status;
		this.statusQueue = this.statusQueue.then(() =>
			this.chat
				.setThreadStatus({
					threadId: this.threadId,
					userId: this.userId,
					status,
				})
				.catch(() => undefined),
		);
		return this.statusQueue;
	}

	/** The SDK's stream retry replayed a step after a provider error. */
	onProviderRetry(): void {
		this.retryFlags.providerRetries += 1;
	}

	onToolExecutionStart(event: unknown): void {
		const toolCall = (event as { toolCall?: { toolName?: string } | null })
			.toolCall;
		if (toolCall?.toolName === "retryAgent") {
			void this.setStatus("retrying");
		}
	}

	onToolExecutionEnd(event: unknown): void {
		const call = (
			event as {
				toolCall?: {
					toolCallId?: string;
					toolName?: string;
					input?: unknown;
				} | null;
			}
		).toolCall;
		if (!call?.toolCallId) return;
		this.toolExecutions.set(call.toolCallId, {
			toolName: call.toolName ?? "unknown",
			input: call.input,
			startedAt: new Date().toISOString(),
		});
		const output = (
			event as {
				toolOutput?:
					| { type: "tool-result"; output: unknown }
					| { type: "tool-error"; error: unknown }
					| undefined;
			}
		).toolOutput;
		this.toolResults.set(call.toolCallId, {
			status: output?.type === "tool-error" ? "failed" : "completed",
			output:
				output?.type === "tool-error"
					? { error: String(output.error) }
					: output?.output,
		});
		if (output?.type === "tool-error") {
			this.toolErrorCount += 1;
			this.lastToolError = String(output.error ?? "Unknown tool error");
		}
		// Status drives the sidebar dot: a failed tool call flips the thread
		// to `retrying` (the agent is recovering); the next successful call
		// flips it back to `running`. streamRetries (malformed tool JSON) and
		// the retryAgent sub-agent both route through this.
		if (output?.type === "tool-error") {
			void this.setStatus("retrying");
		} else if (this.lastSetStatus === "retrying") {
			void this.setStatus("running");
		}
	}

	onStepEnd(event: unknown): void {
		const e = event as {
			stepNumber?: number;
			text?: string;
			finishReason?: string;
			toolCalls?: Array<{
				toolCallId?: string;
				toolName?: string;
				input?: unknown;
			}>;
		};
		const calls: StepToolCall[] = [];
		for (const toolCall of e.toolCalls ?? []) {
			if (!toolCall?.toolCallId) continue;
			const started = this.toolExecutions.get(toolCall.toolCallId);
			const finished = this.toolResults.get(toolCall.toolCallId);
			calls.push({
				toolCallId: toolCall.toolCallId,
				toolName: toolCall.toolName ?? "unknown",
				input: toolCall.input,
				status: finished?.status ?? "running",
				...(finished ? { output: finished.output } : {}),
				startedAt: started?.startedAt ?? new Date().toISOString(),
			});
		}
		this.stepSnapshots.push({
			position: e.stepNumber ?? 0,
			text: e.text ?? "",
			toolCalls: calls,
		});

		// Mirror the loop guards: count provider-error steps (the SDK's stream
		// retry replays a failed step verbatim → visible doubling) and detect
		// identical tool+input erroring repeatedly (model re-firing a failing
		// call). The guard stops the loop; this records WHY for the user tile.
		if (e.finishReason === "error") {
			this.providerErrorSteps += 1;
			if (this.providerErrorSteps >= MAX_PROVIDER_REPLAYS) {
				this.stoppedByGuard ??= `the provider call failed ${this.providerErrorSteps} times in this turn`;
			}
		}
		const stepErrors = calls.filter((c) => c.status === "failed");
		if (stepErrors.length > 0) {
			for (const err of stepErrors) {
				const key = `${err.toolName}\u0000${JSON.stringify(err.input ?? null)}`;
				if (
					this.identicalToolErrorInputs.has(key) &&
					this.stoppedByGuard == null
				) {
					this.stoppedByGuard = `the same tool call ("${err.toolName}") failed twice with identical input`;
				}
				this.identicalToolErrorInputs.add(key);
			}
		}
	}

	/** Agent-level stream end (finish reason + total usage known). Flags the
	 *  turn failed/aborted and, when the UIMessage stream may never reach its
	 *  own onEnd (abort, loop death), persists the turn right here. */
	async onAgentEnd(event: {
		finishReason?: string;
		totalUsage?: {
			inputTokens?: number;
			outputTokens?: number;
			totalTokens?: number;
		};
	}): Promise<void> {
		try {
			if (event.finishReason === "error") {
				this.streamFailed = true;
			}
			// The user stopped the turn (composer Stop, sidebar Stop, tab
			// close): persist what streamed so far, but mark it aborted so the
			// terminal persistence below resets the thread instead of
			// flagging it failed. AI SDK v7 has no dedicated abort finish
			// reason — an aborted stream reports `other` (or `error` when the
			// provider throws on the dead request), so `abortSignal` presence
			// + non-stop reasons is the discriminator.
			if (
				this.signal != null &&
				(event.finishReason === "other" || event.finishReason === "error")
			) {
				this.streamAborted = true;
			}
			const usage = event.totalUsage;
			this.finalUsage = {
				inputTokens: usage?.inputTokens ?? 0,
				outputTokens: usage?.outputTokens ?? 0,
				totalTokens: usage?.totalTokens ?? 0,
			}; // Aborted requests may tear down the UIMessage stream before its
			// own onEnd fires — persist the turn here (digest-only) so the
			// partial work still lands in the DB. The `turnPersisted` guard in
			// finishTurn dedupes against a raced stream-onEnd. Same for FAILED
			// streams: the UI-stream onEnd frequently never fires when the
			// loop dies (provider error, invalid tool schema), so without
			// persisting here the failure tile never lands.
			if (this.streamAborted || this.streamFailed) {
				await this.finishTurn();
			}
		} catch (err) {
			console.error("[agent-turn] on-finish hooks failed", err);
		}
	}

	/** Single persistence point for the whole turn (message + parts +
	 *  client-tool answers + steps + terminal status + workflow state +
	 *  deferred auto-title hook). */
	async finishTurn(responseMessage?: UIMessage): Promise<void> {
		try {
			// Failure/abort digest: summarize the tool calls that DID complete
			// as a text part, so the next turn's model (which only sees text
			// parts of older messages after pruneModelHistory) knows what work
			// actually happened — instead of confidently reporting "nothing".
			const digest =
				this.streamFailed || this.streamAborted
					? buildFailureDigest(this.toolExecutions, this.toolResults)
					: null;
			// Reasoning streamed to the client live but is never persisted
			// (providers reject `reasoning_content` on replay).
			const persistedParts = (responseMessage?.parts ?? []).filter((p) => {
				const type = (p as { type?: string }).type;
				return type !== "reasoning" && type !== "reasoning-file";
			});
			// A stream retry re-streams the step after a provider error: the
			// first attempt's (closed) text part stays in the message alongside
			// the retry's text part, so the same narration would be persisted
			// and rendered twice. Collapse only when a retry actually happened,
			// so normal turns are untouched.
			const dedupedParts =
				this.retryFlags.providerRetries > 0
					? collapseRetriedTextParts(persistedParts)
					: persistedParts;
			const partsWithDigest =
				digest && responseMessage
					? [...dedupedParts, { type: "text" as const, text: `\n\n${digest}` }]
					: dedupedParts;

			const dedupedText = textPartsText(dedupedParts);
			if (!this.turnPersisted) {
				this.turnPersisted = true;
				if (dedupedText || digest) {
					await this.chat.saveMessage({
						userId: this.userId,
						threadId: this.threadId,
						role: "assistant",
						content: digest ? `${dedupedText}\n\n${digest}` : dedupedText,
						parts: responseMessage
							? partsWithDigest
							: digest
								? [{ type: "text" as const, text: digest }]
								: partsWithDigest,
						usage: this.finalUsage,
						steps: this.stepSnapshots,
					});
				}

				if (this.mode === "run" && this.boundWorkflow) {
					await this.chat.setWorkflowStatus({
						workflowId: this.boundWorkflow.id,
						userId: this.userId,
						status: "running",
					});
				}

				// A provider/model error killed the stream (retries exhausted) or
				// tool-level failures accumulated (invalid tool schema, tool threw):
				// persist a thread-internal error tile and mark the thread failed
				// so a re-run triggers the retryAgent repair path.
				if (this.streamFailed) {
					const tileText =
						!this.streamAborted && this.toolErrorCount > 0
							? `${FAILED_TURN_TOOL_ERRORS_PREFIX}${this.lastToolError ?? "Unknown tool error"}`
							: FAILED_TURN_TEXT;
					// Resume affordance: summarize the last completed step from the
					// step snapshots (the same source the failure digest uses) so the
					// user — and the retryAgent repair on re-run — knows exactly
					// where to pick up instead of restarting from scratch.
					const lastCompleted = [...this.stepSnapshots]
						.reverse()
						.find(
							(s) =>
								s.toolCalls.length > 0 &&
								s.toolCalls.every((c) => c.status === "completed"),
						);
					const lastCompletedLabel = lastCompleted
						? `${lastCompleted.text?.trim() || `Step ${lastCompleted.position + 1}`} (${lastCompleted.toolCalls.map((c) => c.toolName).join(", ")} succeeded)`
						: null;
					const tileWithResume = lastCompletedLabel
						? `${tileText}.${RESUME_HINT_PREFIX}${lastCompletedLabel}.`
						: tileText;
					await this.chat.saveMessage({
						userId: this.userId,
						threadId: this.threadId,
						role: "system",
						content: tileWithResume,
						parts: [
							{
								type: "system-message",
								variant: "error",
								text: tileWithResume,
							},
						],
					});
				} else if (this.stoppedByGuard != null) {
					// The turn is NOT failed — a final answer was produced — but the
					// loop was cut short because content was about to repeat (provider
					// replay or identical tool call re-fired). Say so, visibly.
					const tileText = `${LOOP_GUARD_TILE_PREFIX}${this.stoppedByGuard}. No further attempts were made so the answer is not duplicated.`;
					await this.chat.saveMessage({
						userId: this.userId,
						threadId: this.threadId,
						role: "system",
						content: tileText,
						parts: [
							{
								type: "system-message",
								variant: "warning",
								text: tileText,
							},
						],
					});
				}
			}

			// Terminal thread status writes (deduped/serialized via setStatus):
			// failed → aborted → awaiting_approval/idle.
			if (this.streamFailed) {
				// Tool errors (invalid schema, tool threw) end the turn failed too,
				// even though the loop reported a normal finish.
				await this.setStatus("failed");
				return;
			}

			// The user stopped the turn: partial content was persisted above;
			// settle the thread to idle (NOT awaiting_approval — the pending
			// cards are dead now) so the sidebar/header leave run state.
			if (this.streamAborted) {
				await this.setStatus("idle");
				return;
			}

			await this.setStatus(
				hasPendingClientTool(responseMessage)
					? "awaiting_approval"
					: "completed",
			);

			// Deferred auto-title hook: only after a successful turn, and it
			// must never block or fail the stream (fire-and-forget).
			if (this.onTurnCompleted) {
				this.onTurnCompleted();
			}
		} catch (err) {
			console.error("[agent-turn] persist-on-finish failed", err);
		}
	}
}
