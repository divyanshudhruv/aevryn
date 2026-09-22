import { createStreamRetryFlags, MAX_PROVIDER_REPLAYS } from "@aevryn/agent";
import type { RunStatus, StepToolCall, Workflow } from "@aevryn/db";
import type { UIMessage } from "ai";

import type { ChatService } from "./chat-service";

const FAILED_TURN_TEXT =
	'The generation failed mid-run and this turn was cut off. Re-run the thread or reply "continue" to pick back up.';

const FAILED_TURN_TOOL_ERRORS_PREFIX =
	"Tool calls failed during this turn — the result may be incomplete. Last error: ";

const RESUME_HINT_PREFIX = " Completed so far: ";

const LOOP_GUARD_TILE_PREFIX =
	"This turn was stopped early to avoid repeating itself — ";

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

const DIGEST_TOOL_OUTPUT_CHARS = 600;
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
	signal?: AbortSignal | null;
	onTurnCompleted?: () => void;
}

export class TurnLifecycle {
	private readonly chat: ChatService;
	private readonly userId: string;
	private readonly threadId: string;
	private readonly mode: "chat" | "run";
	private readonly boundWorkflow: Workflow | null;
	private readonly signal: AbortSignal | null | undefined;
	private readonly onTurnCompleted?: () => void;

	private readonly retryFlags = createStreamRetryFlags();

	private lastSetStatus: RunStatus | null = null;
	private statusQueue: Promise<void> = Promise.resolve();

	private readonly toolExecutions = new Map<string, ToolExecutionRecord>();
	private readonly toolResults = new Map<string, ToolResultRecord>();
	private readonly stepSnapshots: Array<{
		position: number;
		text: string;
		toolCalls: StepToolCall[];
	}> = [];
	private finalUsage = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};
	private streamFailed = false;
	private streamAborted = false;
	private toolErrorCount = 0;
	private lastToolError: string | null = null;
	private providerErrorSteps = 0;
	private stoppedByGuard: string | null = null;
	private readonly identicalToolErrorInputs = new Set<string>();

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
			};
			if (this.streamAborted || this.streamFailed) {
				await this.finishTurn();
			}
		} catch (err) {
			console.error("[agent-turn] on-finish hooks failed", err);
		}
	}

	async finishTurn(responseMessage?: UIMessage): Promise<void> {
		try {
			const digest =
				this.streamFailed || this.streamAborted
					? buildFailureDigest(this.toolExecutions, this.toolResults)
					: null;
			const persistedParts = (responseMessage?.parts ?? []).filter((p) => {
				const type = (p as { type?: string }).type;
				return type !== "reasoning" && type !== "reasoning-file";
			});
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

				if (this.streamFailed) {
					const tileText =
						!this.streamAborted && this.toolErrorCount > 0
							? `${FAILED_TURN_TOOL_ERRORS_PREFIX}${this.lastToolError ?? "Unknown tool error"}`
							: FAILED_TURN_TEXT;
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

			if (this.streamFailed) {
				await this.setStatus("failed");
				return;
			}

			if (this.streamAborted) {
				await this.setStatus("idle");
				return;
			}

			await this.setStatus(
				hasPendingClientTool(responseMessage)
					? "awaiting_approval"
					: "completed",
			);

			if (this.onTurnCompleted) {
				this.onTurnCompleted();
			}
		} catch (err) {
			console.error("[agent-turn] persist-on-finish failed", err);
		}
	}
}
