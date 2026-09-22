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
import {
	Fragment,
	memo,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	AskUserCard,
	answersFromAskUserOutput,
	decisionFromOutput,
} from "@/components/chat/timeline-cards";
import {
	clientToolOutcomeRow,
	isCompletedClientTool,
	type MessageTurn,
	messageTimestamp,
	planFromInput,
	questionsFromInput,
	splitIntoTurns,
	truncateHeader,
} from "@/components/chat/timeline-utils";
import { ApprovalFlow } from "@/components/workspace/approval-flow";

const APPROVAL_TOOLS = new Set(["wireAction", "wireBuildRequest"]);

const THINKING_WORDS = [
	"Thinking",
	"Planning",
	"Refining",
	"Analyzing",
	"Processing",
	"Generating",
	"Building",
];

const MARKDOWN_THROTTLE_MS = 80;

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
	threadStatus?: string;
	onToolAnswer: (toolCallId: string, toolName: string, answer: unknown) => void;
	onApproval: (toolCallId: string, approved: boolean) => void;
}

const MemoizedMarkdown = memo(function MemoizedMarkdown({
	content,
	className,
}: {
	content: string;
	className?: string;
}) {
	return <Markdown content={content} className={className} />;
});

function TimelineMarkdown({
	content,
	className,
	live,
}: {
	content: string;
	className?: string;
	live?: boolean;
}) {
	const [rendered, setRendered] = useState(content);
	useEffect(() => {
		if (!live) {
			if (content !== rendered) setRendered(content);
			return;
		}
		if (content === rendered) return;
		const id = setTimeout(() => setRendered(content), MARKDOWN_THROTTLE_MS);
		return () => clearTimeout(id);
	}, [content, live, rendered]);
	return <MemoizedMarkdown content={rendered} className={className} />;
}

interface TimelineMessageProps {
	message: UIMessage;
	isLastMessage: boolean;
	superseded: boolean;
	stillStreaming: boolean;
	statusActive: boolean;
	onToolAnswer: (toolCallId: string, toolName: string, answer: unknown) => void;
	onApproval: (toolCallId: string, approved: boolean) => void;
}

const TimelineMessage = memo(function TimelineMessage({
	message,
	isLastMessage,
	superseded,
	stillStreaming,
	statusActive,
	onToolAnswer,
	onApproval,
}: TimelineMessageProps) {
	const isUser = message.role === "user";

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
					className="mb-[40px]"
					variant={sm.variant === "warning" ? "warning" : "error"}
				>
					<p>{sm.text ?? ""}</p>
				</SystemMessage>,
			);
		}
		return <>{tiles}</>;
	}

	const turns: MessageTurn[] = isUser
		? [{ parts: message.parts, offset: 0 }]
		: splitIntoTurns(message.parts);

	if (
		!isUser &&
		statusActive &&
		!message.parts.some(
			(p) =>
				p.type === "text" ||
				p.type.startsWith("tool-") ||
				((p as { text?: string }).text?.trim().length ?? 0) > 0,
		)
	) {
		return null;
	}

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
			const dead = completed || superseded;
			const answers = completed
				? answersFromAskUserOutput(toolPart.output)
				: undefined;
			return (
				<AskUserCard
					key={key}
					questions={questions}
					answers={answers}
					disabled={dead}
					onComplete={
						dead
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
			const dead = completed || superseded;
			const decision = completed
				? decisionFromOutput(toolPart.output)
				: undefined;
			return (
				<PlanApprovalCard
					key={key}
					plan={plan}
					completed={dead}
					decision={decision?.decision}
					feedback={decision?.feedback}
					onDecision={(result: PlanDecisionResult) =>
						onToolAnswer(toolPart.toolCallId ?? "", "presentPlan", result)
					}
				/>
			);
		}

		if (
			APPROVAL_TOOLS.has(toolName) &&
			toolPart.state === "approval-requested"
		) {
			return (
				<ApprovalFlow
					key={key}
					toolName={toolName}
					input={toolPart.input}
					disabled={superseded}
					onDecide={(decision) =>
						onApproval(toolPart.toolCallId ?? "", decision === "approved")
					}
				/>
			);
		}

		return null;
	};

	return (
		<>
			{turns.map((turn, turnIndex) => {
				const turnKey = `${message.id}-t${turnIndex}`;
				const isLastTurn = turnIndex === turns.length - 1;
				const isLiveTurn = isLastTurn;
				const responseParts = turn.parts;

				const isStepTool = (part: UIMessage["parts"][number]): boolean => {
					if (!part.type.startsWith("tool-")) return false;
					const toolName = part.type.slice(5);
					return !(
						toolName === "askUser" ||
						toolName === "presentPlan" ||
						APPROVAL_TOOLS.has(toolName)
					);
				};
				const isBeginTask = (part: UIMessage["parts"][number]): boolean =>
					part.type === "tool-beginTask";

				interface StepGroup {
					segments: ToolCallStepSegment[];
					leadText: string;
					title?: string;
				}
				const groups: StepGroup[] = [];
				let openGroup: StepGroup | null = null;
				let pendingReasoning = "";
				let leadText = "";
				let pendingHeader = "";
				responseParts.forEach((part, index) => {
					if (isBeginTask(part)) {
						if (openGroup) {
							groups.push(openGroup);
							openGroup = null;
						}
						const taskInput = part as { input?: unknown };
						const label =
							taskInput.input != null &&
							typeof taskInput.input === "object" &&
							typeof (taskInput.input as Record<string, unknown>).label ===
								"string"
								? ((taskInput.input as Record<string, unknown>).label as string)
								: "";
						pendingHeader = label || pendingHeader;
						return;
					}
					if (part.type === "text") {
						const text = (part as { text?: string }).text?.trim() ?? "";
						if (!text) return;
						if (openGroup) {
							groups.push(openGroup);
							openGroup = null;
							leadText = text;
							pendingHeader = pendingHeader || truncateHeader(text);
						} else if (groups.length === 0) {
							leadText = leadText ? `${leadText} ${text}` : text;
						} else {
							leadText = text;
							pendingHeader = pendingHeader || truncateHeader(text);
						}
						return;
					}
					if (part.type === "reasoning") {
						const text = (part as { text?: string }).text?.trim() ?? "";
						if (openGroup) {
							const last = openGroup.segments.at(-1);
							if (last && !last.description) last.description = text;
							else if (last)
								last.description = `${last.description}\n\n${text}`.trim();
						} else {
							pendingReasoning = pendingReasoning
								? `${pendingReasoning}\n\n${text}`
								: text;
						}
						return;
					}
					if (!isStepTool(part)) return;
					const toolPart = part as {
						toolCallId?: string;
						input?: unknown;
						output?: unknown;
						state?: string;
						errorText?: string;
					};
					if (!openGroup) {
						openGroup = {
							segments: [],
							leadText,
							...(pendingHeader ? { title: pendingHeader } : {}),
						};
						groups.push(openGroup);
						leadText = "";
						pendingHeader = "";
					}
					const toolName = part.type.slice(5);
					const partIncomplete =
						toolPart.state === "input-available" ||
						toolPart.state === "input-streaming";
					const interrupted =
						partIncomplete &&
						!(stillStreaming && isLastMessage && isLiveTurn) &&
						partIncomplete;
					const segment: ToolCallStepSegment = {
						toolCallId: toolPart.toolCallId ?? `${turnKey}-${index}`,
						toolName,
						input: toolPart.input,
						output: toolPart.output,
						isRunning: partIncomplete && !interrupted,
						isStopped: interrupted,
						isError:
							toolPart.state === "output-error" || toolPart.errorText != null,
					};
					if (pendingReasoning && !segment.isRunning) {
						segment.description = pendingReasoning;
						pendingReasoning = "";
					}
					openGroup.segments.push(segment);
				});
				if (openGroup) groups.push(openGroup);

				const hasAgentSteps = groups.length > 0;
				const lastStepIndex = responseParts.reduce(
					(last, p, i) => (isStepTool(p) ? i : last),
					-1,
				);

				const stillRunning = isLastMessage && isLiveTurn && stillStreaming;

				const responseText = responseParts
					.filter((p) => p.type === "text")
					.map((p) => (p as { text?: string }).text ?? "")
					.join("\n");

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

				if (hasAgentSteps) {
					groups.forEach((group, gi) => {
						const isLastGroup = gi === groups.length - 1;
						const groupLead = group.leadText;
						if (groupLead) {
							bubbleChildren.push(
								<TimelineMarkdown
									key={`${turnKey}-g${gi}-lead`}
									content={groupLead}
									live={stillRunning}
								/>,
							);
						}
						bubbleChildren.push(
							<ToolCallSequence
								key={`${turnKey}-g${gi}-steps`}
								title={group.title}
								steps={group.segments}
								answerStep={
									isLastGroup &&
									(stillRunning || responseParts.some((p) => p.type === "text"))
								}
								answerRunning={
									stillRunning &&
									isLastGroup &&
									!group.segments.some((s) => s.isRunning)
								}
							/>,
						);
					});
				}

				responseParts.forEach((part, partIndex) => {
					const key = `${turnKey}-${partIndex}`;

					if (part.type === "text") {
						const text = (part as { text: string }).text;
						if (!text) return;
						if (hasAgentSteps && partIndex < lastStepIndex) return;
						bubbleChildren.push(
							isUser ? (
								<div key={key} className="whitespace-pre-wrap">
									{text}
								</div>
							) : (
								<TimelineMarkdown
									key={key}
									content={text}
									live={stillRunning}
								/>
							),
						);
						return;
					}

					if (!part.type.startsWith("tool-")) return;

					const toolName = part.type.slice(5);
					const card = renderClientCard(toolName, part, key);
					if (card) {
						if (
							bubbleChildren.length === 0 &&
							(toolName === "askUser" || toolName === "presentPlan")
						) {
							bubbleChildren.push(
								<TimelineMarkdown
									key={`${key}-lead`}
									content={
										toolName === "askUser"
											? "Before I proceed, a few quick questions:"
											: "Here's my proposed plan:"
									}
								/>,
							);
						}
						bubbleChildren.push(card);
					}
				});

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
							className={outcome.className ?? "mt-[20px] mb-[40px]"}
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
				return <Fragment key={turnKey}>{out}</Fragment>;
			})}
		</>
	);
});

export const ConversationTimeline = memo(function ConversationTimeline({
	messages,
	status,
	threadStatus,
	onToolAnswer,
	onApproval,
}: TimelineProps) {
	const bottomRef = useRef<HTMLDivElement | null>(null);

	const didInitialScroll = useRef(false);
	useEffect(() => {
		if (didInitialScroll.current || messages.length === 0) return;
		didInitialScroll.current = true;
		bottomRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "end",
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages]);

	useEffect(() => {
		if (messages.at(-1)?.role === "user") {
			bottomRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "end",
			});
		}
	}, [messages]);

	const lastMessage = messages.at(-1);

	const lastCompletedClientTool = lastMessage?.parts.reduce(
		(idx, p, i) => (isCompletedClientTool(p) ? i : idx),
		-1,
	);
	const tail = lastMessage
		? lastMessage.parts.slice((lastCompletedClientTool ?? -1) + 1)
		: [];
	const hasVisibleActivity = tail.some(
		(p: UIMessage["parts"][number]) =>
			p.type === "text" ||
			(p.type.startsWith("tool-") &&
				(p as { state?: string }).state !== "output-available"),
	);

	const waitingForAgentReply =
		lastMessage?.role === "assistant" &&
		(lastCompletedClientTool ?? -1) >= 0 &&
		!hasVisibleActivity;

	const showThinking =
		lastMessage?.role === "assistant" &&
		!hasVisibleActivity &&
		(status === "streaming" || status === "submitted" || waitingForAgentReply);

	const lastUserMessageIndex = (() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i]?.role === "user") return i;
		}
		return -1;
	})();
	const cardsSupersededByStatus =
		threadStatus != null && threadStatus !== "awaiting_approval";
	const stillStreaming = status === "submitted" || status === "streaming";
	const statusActive = status !== "idle";

	return (
		<div className="flex min-h-full flex-col gap-2 p-4">
			{messages.map((message, messageIndex) => (
				<TimelineMessage
					key={message.id}
					message={message}
					isLastMessage={messageIndex === messages.length - 1}
					superseded={
						lastUserMessageIndex > messageIndex || cardsSupersededByStatus
					}
					stillStreaming={stillStreaming}
					statusActive={statusActive}
					onToolAnswer={onToolAnswer}
					onApproval={onApproval}
				/>
			))}
			{showThinking && (
				<ChatMessage from="assistant">
					<ThinkingIndicator words={THINKING_WORDS} />
				</ChatMessage>
			)}
			<div ref={bottomRef} />
		</div>
	);
});

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
					} catch {}
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
