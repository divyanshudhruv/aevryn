"use client";

import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import type { AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";
import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";
import { Markdown } from "@aevryn/ui/components/ui/markdown";
import {
	PlanApprovalCard,
	type PlanDecisionResult,
	type PlanInput,
} from "@aevryn/ui/components/ui/plan-approval-card";
import { SystemMessage } from "@aevryn/ui/components/ui/system-message";
import { ThinkingIndicator } from "@aevryn/ui/components/ui/thinking-indicator";
import {
	ToolCallSequence,
	type ToolCallStepSegment,
} from "@aevryn/ui/components/ui/tool-call-step";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { useSize } from "@aevryn/ui/lib/size-context";
import { cn } from "@aevryn/ui/lib/utils";
import type { UIMessage } from "ai";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PlanStepsCard } from "@/components/chat/plan-steps-card";
import { ApprovalFlow } from "@/components/workspace/approval-flow";

const CLIENT_TOOLS = new Set([
	"askUser",
	"presentPlan",
	"wireAction",
	"wireBuildRequest",
]);
const APPROVAL_TOOLS = new Set(["wireAction", "wireBuildRequest"]);

export interface TimelinePlanStep {
	id: string;
	position: number;
	title: string;
	description: string | null;
	status: string;
}

interface TimelineProps {
	messages: UIMessage[];
	status: "idle" | "streaming" | "submitted" | "error";
	planSteps?: TimelinePlanStep[];
	onToolAnswer: (toolCallId: string, toolName: string, answer: unknown) => void;
	onApproval: (toolCallId: string, approved: boolean) => void;
	errorMessage?: string | null;
}

function questionsFromInput(input: unknown) {
	if (!Array.isArray(input)) return null;
	return input as Array<Record<string, unknown>>;
}

/** Real timestamp from persisted/stream metadata; falls back to now for
 *  brand-new live messages (their createdAt arrives on the finish event). */
function messageTimestamp(message: UIMessage): string {
	const createdAt = (message.metadata as { createdAt?: string } | undefined)
		?.createdAt;
	const date = createdAt ? new Date(createdAt) : new Date();
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString(undefined, {
		weekday: "long",
		hour: "numeric",
		minute: "2-digit",
	});
}

/** Human-facing copy for a completed askUser / presentPlan interaction. */
function clientToolOutcomeRow(
	toolName: string,
	output: unknown,
): { message: string; className?: string } | null {
	if (output == null || typeof output !== "object") return null;
	const record = output as Record<string, unknown>;

	if (toolName === "askUser") {
		return { message: "Questions filled and submitted by the user" };
	}

	if (toolName === "presentPlan") {
		const decision = typeof record.decision === "string" ? record.decision : "";
		if (decision === "approved") {
			return {
				message: "Plan approved — executing now",
				className: "mb-[40px]",
			};
		}
		if (decision === "bound") {
			return {
				message: "Plan approved and bound to this thread",
				className: "mb-[40px]",
			};
		}
		if (decision === "changes_requested") {
			const feedback =
				typeof record.feedback === "string" && record.feedback.trim().length > 0
					? ` — “${record.feedback.trim()}”`
					: "";
			return {
				message: `Changes requested${feedback}`,
				className: "mb-[40px]",
			};
		}
		if (decision === "declined") {
			return {
				message: "Plan declined — staying in chat",
				className: "mb-[40px]",
			};
		}
	}

	return null;
}

function planFromInput(input: unknown): PlanInput | null {
	if (input == null || typeof input !== "object") return null;
	const record = input as Record<string, unknown>;
	if (
		typeof record.title !== "string" ||
		typeof record.objective !== "string" ||
		!Array.isArray(record.steps)
	) {
		return null;
	}
	return {
		title: record.title,
		objective: record.objective,
		summary: typeof record.summary === "string" ? record.summary : undefined,
		steps: record.steps as PlanInput["steps"],
	};
}

function isCompletedClientTool(part: UIMessage["parts"][number]): boolean {
	if (!part.type.startsWith("tool-")) return false;
	if (!CLIENT_TOOLS.has(part.type.slice(5))) return false;
	return (part as { state?: string }).state === "output-available";
}

interface MessageTurn {
	parts: UIMessage["parts"];
	offset: number;
}

/** Split one assistant message into turns: a new turn starts right after
 *  every *completed* client-tool part (answered askUser/presentPlan, decided
 *  wire action). The answer's card closes its turn; whatever the agent
 *  streams next opens a fresh bubble — no more same-message grouping. */
function splitIntoTurns(parts: UIMessage["parts"]): MessageTurn[] {
	if (parts.length === 0) return [{ parts, offset: 0 }];
	const turns: MessageTurn[] = [];
	let start = 0;
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (!part) continue;
		if (isCompletedClientTool(part)) {
			if (i >= start) {
				turns.push({ parts: parts.slice(start, i + 1), offset: start });
			}
			start = i + 1;
		}
	}
	if (start < parts.length) {
		turns.push({ parts: parts.slice(start), offset: start });
	}
	return turns;
}

/** Completed askUser output → per-question answers for the locked card.
 *  The tool returns { answers: {...} }; tolerate a bare answers map. */
function answersFromAskUserOutput(
	output: unknown,
): Record<string, AskUserAnswer> | undefined {
	if (output == null || typeof output !== "object") return undefined;
	const record = output as Record<string, unknown>;
	const answers = record.answers ?? record;
	if (answers == null || typeof answers !== "object") return undefined;
	const result: Record<string, AskUserAnswer> = {};
	for (const [questionId, value] of Object.entries(answers)) {
		const answer = value as Record<string, unknown>;
		if (answer == null || typeof answer !== "object") continue;
		result[questionId] = {
			questionId,
			selectedIds: Array.isArray(answer.selectedIds)
				? (answer.selectedIds as string[])
				: [],
			otherText:
				typeof answer.otherText === "string" ? answer.otherText : undefined,
			skipped: answer.skipped === true,
		};
	}
	return result;
}

/** Completed presentPlan output → the decision shown on the locked card. */
function decisionFromOutput(output: unknown): PlanDecisionResult | undefined {
	if (output == null || typeof output !== "object") return undefined;
	const record = output as Record<string, unknown>;
	const decision = record.decision as
		| PlanDecisionResult["decision"]
		| undefined;
	if (decision == null) return undefined;
	const feedback =
		typeof record.feedback === "string" ? record.feedback : undefined;
	return feedback ? { decision, feedback } : { decision };
}

export function ConversationTimeline({
	messages,
	status,
	planSteps,
	onToolAnswer,
	onApproval,
	errorMessage,
}: TimelineProps) {
	const bottomRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLElement | null>(null);

	const autoScrollRef = useRef(true);

	// Track whether the user has manually scrolled away from the bottom.
	// Auto-scroll only fires when the user hasn't intervened.
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		const onScroll = () => {
			const distFromBottom =
				container.scrollHeight - container.scrollTop - container.clientHeight;
			autoScrollRef.current = distFromBottom < 240;
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		return () => container.removeEventListener("scroll", onScroll);
	}, []);

	// Auto-scroll: only when user is near bottom or a fresh user message arrives.
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		const lastMsg = messages.at(-1);
		const isUserMessage = lastMsg?.role === "user";
		if (!autoScrollRef.current && !isUserMessage) return;
		bottomRef.current?.scrollIntoView({
			behavior: isUserMessage ? "instant" : "smooth",
			block: "end",
		});
	}, [messages]);

	// Thinking indicator: while a turn is streaming and nothing has landed yet
	// (no text, no running tool step) — including right after an askUser answer
	// or plan decision, while the agent is working.
	const lastMessage = messages.at(-1);
	const showThinking =
		(status === "streaming" || status === "submitted") &&
		lastMessage?.role === "assistant" &&
		!lastMessage.parts.some(
			(p) =>
				p.type === "text" ||
				(p.type.startsWith("tool-") &&
					(p as { state?: string }).state !== "output-available"),
		);

	// Renders one client/approval card (askUser, presentPlan, wire approvals)
	// for a given tool part, or null when the part needs no standalone card.
	const renderClientCard = (
		toolName: string,
		part: UIMessage["parts"][number],
		key: string,
	): ReactNode | null => {
		const toolPart = part as {
			type: string;
			state?: string;
			toolCallId?: string;
			input?: unknown;
			output?: unknown;
			errorText?: string;
		};

		if (toolName === "askUser") {
			const questions = questionsFromInput(toolPart.input);
			if (!questions) return null;
			const completed = toolPart.state === "output-available";
			const answers = completed
				? answersFromAskUserOutput(toolPart.output)
				: undefined;
			return (
				<AskUserCard
					key={key}
					questions={questions}
					answers={answers}
					disabled={completed}
					onComplete={
						completed
							? undefined
							: (answers) => {
									onToolAnswer(toolPart.toolCallId ?? "", "askUser", answers);
								}
					}
				/>
			);
		}

		if (toolName === "presentPlan") {
			const plan = planFromInput(toolPart.input);
			if (!plan) return null;
			const completed = toolPart.state === "output-available";
			const decision = completed
				? decisionFromOutput(toolPart.output)
				: undefined;
			return (
				<PlanApprovalCard
					key={key}
					plan={plan}
					completed={completed}
					decision={decision?.decision}
					feedback={decision?.feedback}
					onDecision={(result: PlanDecisionResult) =>
						onToolAnswer(toolPart.toolCallId ?? "", "presentPlan", result)
					}
				/>
			);
		}

		// Native approvals (wireAction, wireBuildRequest).
		if (
			APPROVAL_TOOLS.has(toolName) &&
			toolPart.state === "approval-requested"
		) {
			return (
				<ApprovalFlow
					key={key}
					toolName={toolName}
					input={toolPart.input}
					onDecide={(decision) =>
						onApproval(toolPart.toolCallId ?? "", decision === "approved")
					}
				/>
			);
		}

		return null;
	};

	return (
		<div
			ref={(node) => {
				// Climb to the real scroll container (the overflow-y-auto section),
				// not the enclosing max-width wrapper.
				let el = node?.parentElement ?? null;
				while (el) {
					const overflowY = getComputedStyle(el).overflowY;
					if (overflowY === "auto" || overflowY === "scroll") break;
					el = el.parentElement;
				}
				scrollContainerRef.current = el;
			}}
			className="flex min-h-full flex-col gap-2 p-4"
		>
			{messages.flatMap((message) => {
				const isUser = message.role === "user";

				// Thread-internal system tiles (stream failures, retry notices)
				// render as SystemMessage, never as a chat bubble.
				if (message.role === "system") {
					const tiles: ReactNode[] = [];
					for (const [i, part] of message.parts.entries()) {
						const sm = part as {
							type?: string;
							variant?: string;
							text?: string;
						};
						if (sm.type !== "system-message") continue;
						tiles.push(
							<SystemMessage
								key={`sys-${message.id}-${i}`}
								fill
								variant={sm.variant === "warning" ? "warning" : "error"}
							>
								<p>{sm.text ?? ""}</p>
							</SystemMessage>,
						);
					}
					return tiles;
				}

				// One assistant turn = ONE ChatMessage: split the loop into turns at
				// each completed client-tool boundary (answered askUser/presentPlan,
				// decided wire action) so the answer closes its bubble and whatever
				// the agent streams next opens a fresh one. Separate user prompts
				// produce separate messages, and therefore separate bubbles.
				const turns: MessageTurn[] = isUser
					? [{ parts: message.parts, offset: 0 }]
					: splitIntoTurns(message.parts);

				// The SDK creates a placeholder assistant message the moment a turn
				// starts (status submitted/streaming). Render nothing for it — no
				// empty bubble, no reserved gap — until real content (a tool step,
				// text, or a client card) exists. The thinking indicator covers the
				// wait instead.
				if (
					!isUser &&
					status !== "idle" &&
					!message.parts.some(
						(p) =>
							p.type === "text" ||
							p.type.startsWith("tool-") ||
							((p as { text?: string }).text?.trim().length ?? 0) > 0,
					)
				) {
					return [];
				}

				return turns.flatMap((turn, turnIndex) => {
					const turnKey = `${message.id}-t${turnIndex}`;
					const isLastTurn = turnIndex === turns.length - 1;
					const responseParts = turn.parts;

					// Tool calls that are not client/approval cards get grouped into
					// the step card so a run reads like a pipeline: tools → answer.
					const segParts = responseParts
						.map((part, index) => ({ part, index }))
						.filter(({ part }) => {
							if (!part.type.startsWith("tool-")) return false;
							const toolName = part.type.slice(5);
							return !(
								toolName === "askUser" ||
								toolName === "presentPlan" ||
								APPROVAL_TOOLS.has(toolName)
							);
						});
					const hasAgentSteps = segParts.length > 0;
					const firstSegIndex = hasAgentSteps ? (segParts[0]?.index ?? -1) : -1;

					const segments: ToolCallStepSegment[] = segParts.map(
						({ part, index }) => {
							const toolPart = part as {
								toolCallId?: string;
								input?: unknown;
								output?: unknown;
								state?: string;
								errorText?: string;
							};
							const toolName = part.type.slice(5);
							return {
								toolCallId: toolPart.toolCallId ?? `${turnKey}-${index}`,
								toolName,
								input: toolPart.input,
								output: toolPart.output,
								// AI SDK v7 streams: input-streaming → input-available →
								// output-available. Both input states are "running".
								isRunning:
									toolPart.state === "input-available" ||
									toolPart.state === "input-streaming",
								isError:
									toolPart.state === "output-error" ||
									toolPart.errorText != null,
							};
						},
					);

					// Text the model wrote BEFORE its first tool call renders as a normal
					// paragraph above the step card — text reads as text, steps as
					// steps, like the mock (a <p> over the agent calls).
					const leadText = hasAgentSteps
						? responseParts
								.slice(0, firstSegIndex)
								.filter((p) => p.type === "text")
								.map((p) => (p as { text?: string }).text ?? "")
								.join(" ")
								.trim()
						: "";

					const stillRunning =
						message.id === messages[messages.length - 1]?.id &&
						isLastTurn &&
						(status === "submitted" || status === "streaming");

					const responseText = responseParts
						.filter((p) => p.type === "text")
						.map((p) => (p as { text?: string }).text ?? "")
						.join("\n");

					// Usage is a per-message (per-turn) figure from the stream's
					// finish event — show it once, on the turn's final bubble.
					const assistantUsage = isLastTurn
						? (
								message.metadata as
									| {
											usage?: {
												inputTokens?: number;
												outputTokens?: number;
												totalTokens?: number;
											};
									  }
									| undefined
							)?.usage
						: undefined;

					const bubbleChildren: ReactNode[] = [];

					if (leadText) {
						bubbleChildren.push(
							<Markdown key={`${turnKey}-lead`} content={leadText} />,
						);
					}

					if (hasAgentSteps) {
						bubbleChildren.push(
							<ToolCallSequence
								key={`${turnKey}-steps`}
								steps={segments}
								answerStep={
									stillRunning || responseParts.some((p) => p.type === "text")
								}
								answerRunning={
									stillRunning && !segments.some((s) => s.isRunning)
								}
							/>,
						);
					}

					responseParts.forEach((part, partIndex) => {
						const key = `${turnKey}-${partIndex}`;

						if (part.type === "text") {
							const text = (part as { text: string }).text;
							if (!text) return;
							if (hasAgentSteps && partIndex < firstSegIndex) return;
							bubbleChildren.push(
								isUser ? (
									<div key={key} className="whitespace-pre-wrap">
										{text}
									</div>
								) : (
									<Markdown key={key} content={text} />
								),
							);
							return;
						}

						if (!part.type.startsWith("tool-")) return;

						const toolName = part.type.slice(5);
						const card = renderClientCard(toolName, part, key);
						if (card) bubbleChildren.push(card);
					});

					// Outcome rows land AFTER the turn (and therefore the bubble) that
					// produced them (mock shows the card, then the system note).
					const outcomeRows: ReactNode[] = [];
					responseParts.forEach((part, partIndex) => {
						if (!part.type.startsWith("tool-")) return;
						const toolPart = part as {
							state?: string;
							output?: unknown;
						};
						const toolName = part.type.slice(5);
						if (toolPart.state !== "output-available") return;
						if (toolName !== "askUser" && toolName !== "presentPlan") return;
						const outcome = clientToolOutcomeRow(toolName, toolPart.output);
						if (!outcome) return;
						outcomeRows.push(
							<SystemMessage
								key={`${turnKey}-sys-${partIndex}`}
								fill
								className={outcome.className ?? "mb-[40px]"}
							>
								<p>{outcome.message}</p>
							</SystemMessage>,
						);
					});

					const out: ReactNode[] = [];
					if (bubbleChildren.length > 0) {
						out.push(
							<ChatMessage
								key={turnKey}
								from={isUser ? "user" : "assistant"}
								time={messageTimestamp(message)}
								actions={
									responseText.trim().length > 0 ? (
										<MessageActions
											text={responseText}
											usage={isUser ? undefined : assistantUsage}
											feedback={!isUser}
										/>
									) : undefined
								}
							>
								{bubbleChildren}
							</ChatMessage>,
						);
					}
					out.push(...outcomeRows);
					return out;
				});
			})}
			{showThinking && (
				<ChatMessage from="assistant">
					<ThinkingIndicator
						words={[
							"Thinking",
							"Planning",
							"Refining",
							"Analyzing",
							"Processing",
							"Generating",
							"Building",
						]}
					/>
				</ChatMessage>
			)}
			{errorMessage && (
				<SystemMessage variant="error" fill>
					{errorMessage}
				</SystemMessage>
			)}
			{planSteps != null && planSteps.length > 0 && (
				<PlanStepsCard steps={planSteps} />
			)}
			<div ref={bottomRef} />
		</div>
	);
}

/** Hover action bar under a message: copy (both roles), thumbs feedback and
 *  token usage on assistant replies only. The thumbs are inert — clicking one
 *  just confirms the choice with a check mark. */
function MessageActions({
	text,
	usage,
	feedback,
}: {
	text: string;
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	} | null;
	feedback?: boolean;
}) {
	const Copy = useIcon("copy");
	const Check = useIcon("check");
	const ThumbsUp = useIcon("thumbs-up");
	const ThumbsDown = useIcon("thumbs-down");
	const [copied, setCopied] = useState(false);
	const [vote, setVote] = useState<"up" | "down" | null>(null);

	const usageLabel =
		usage?.totalTokens != null && usage.totalTokens > 0
			? `${usage.totalTokens.toLocaleString()} tokens`
			: undefined;
	const compact = useSize().variant === "compact";

	const iconButton = cn(
		"flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground",
	);

	return (
		<>
			{usageLabel && (
				<span
					className={cn(
						"select-none text-muted-foreground tabular-nums",
						compact ? "text-[11px]" : "text-[12px]",
					)}
					title={
						usage?.inputTokens != null && usage?.outputTokens != null
							? `${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out`
							: undefined
					}
				>
					{usageLabel}
				</span>
			)}
			<button
				type="button"
				aria-label="Copy message"
				className={iconButton}
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(text);
						setCopied(true);
						setTimeout(() => setCopied(false), 1_500);
					} catch {
						// Clipboard unavailable (permissions/insecure context).
					}
				}}
			>
				{copied ? (
					<Check size={13} strokeWidth={1.75} />
				) : (
					<Copy size={13} strokeWidth={1.75} />
				)}
			</button>
			{feedback && (
				<>
					<button
						type="button"
						aria-label="Good response"
						className={iconButton}
						onClick={() => setVote("up")}
					>
						{vote === "up" ? (
							<Check size={13} strokeWidth={1.75} />
						) : (
							<ThumbsUp size={13} strokeWidth={1.75} />
						)}
					</button>
					<button
						type="button"
						aria-label="Poor response"
						className={iconButton}
						onClick={() => setVote("down")}
					>
						{vote === "down" ? (
							<Check size={13} strokeWidth={1.75} />
						) : (
							<ThumbsDown size={13} strokeWidth={1.75} />
						)}
					</button>
				</>
			)}
		</>
	);
}

function AskUserCard({
	questions,
	answers,
	disabled,
	onComplete,
}: {
	questions: Array<Record<string, unknown>>;
	answers?: Record<string, AskUserAnswer>;
	disabled?: boolean;
	onComplete?: (answers: Record<string, AskUserAnswer>) => void;
}) {
	return (
		<QuestionFlow
			// The UI component's contract: AskUserQuestion[] minus view-only fields.
			questions={questions as never}
			defaultAnswers={answers as never}
			disabled={disabled}
			onComplete={
				onComplete ??
				(() => {
					// Disabled/review mode must never fire an answer callback.
				})
			}
		/>
	);
}
