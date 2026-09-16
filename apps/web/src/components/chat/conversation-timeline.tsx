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
  /** Live thread status (realtime). Pending cards lock when it is no longer
   *  `awaiting_approval` — e.g. the run was stopped or failed. */
  threadStatus?: string;
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
        className: "mb-[40px] mt-[20px]",
      };
    }
    if (decision === "bound") {
      return {
        message: "Plan approved and bound to this thread",
        className: "mb-[40px] mt-[20px]",
      };
    }
    if (decision === "changes_requested") {
      const feedback =
        typeof record.feedback === "string" && record.feedback.trim().length > 0
          ? ` — “${record.feedback.trim()}”`
          : "";
      return {
        message: `Changes requested${feedback}`,
        className: "mb-[40px] mt-[20px]",
      };
    }
    if (decision === "declined") {
      return {
        message: "Plan declined — staying in chat",
        className: "mb-[40px] mt-[20px]",
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

/** One-line card header from narration text: first sentence, capped. */
function truncateHeader(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const clean = firstSentence.replace(/^(Okay|Alright|Now|So)[,:]\s*/i, "").trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
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
  threadStatus,
  onToolAnswer,
  onApproval,
  errorMessage,
}: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll once the FULL history is painted (one-shot; no per-message
  // restarts, so the smooth animation isn't cut off at half the content).
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

  // Scroll again when the user SENDS a new message. Streaming replies are
  // left alone — while you're at the bottom the browser keeps it pinned.
  useEffect(() => {
    if (messages.at(-1)?.role === "user") {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages]);

  // Thinking indicator: while a turn is streaming and nothing has landed yet
  // (no text, no running tool step) — including right after an askUser answer
  // or plan decision, while the agent is working.
  const lastMessage = messages.at(-1);

  // After the user submits a card, there's a brief window where status is still
  // "idle" before sendAutomaticallyWhen triggers the auto-resume.  Detect this
  // by checking whether the last assistant message ends with a completed client
  // tool card (output-available) and no text has arrived after it yet.
  const waitingForAgentReply =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (p) =>
        p.type.startsWith("tool-") &&
        CLIENT_TOOLS.has(p.type.slice(5)) &&
        (p as { state?: string }).state === "output-available",
    ) &&
    !lastMessage.parts.some((p) => p.type === "text");

  const showThinking =
    lastMessage?.role === "assistant" &&
    !lastMessage.parts.some(
      (p) =>
        p.type === "text" ||
        (p.type.startsWith("tool-") &&
          (p as { state?: string }).state !== "output-available"),
    ) &&
    (status === "streaming" || status === "submitted" || waitingForAgentReply);

  // A pending card is SUPERSEDED — permanently locked — when the user moved
  // on without answering it: any later user message in the thread, or the
  // thread leaving `awaiting_approval` (stopped/failed/re-run), means the
  // agent is no longer waiting on that card. Completed cards keep rendering
  // their recorded answer; only unanswered ones lock.
  const lastUserMessageIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  })();
  const cardsSupersededByStatus =
    threadStatus != null && threadStatus !== "awaiting_approval";

  /** A pending card on message[i] is dead once any newer user message exists
   *  (the user replied in chat instead of the card) or the thread stopped
   *  waiting for approvals altogether. */
  const isSuperseded = (messageIndex: number) =>
    lastUserMessageIndex > messageIndex || cardsSupersededByStatus;

  // Renders one client/approval card (askUser, presentPlan, wire approvals)
  // for a given tool part, or null when the part needs no standalone card.
  const renderClientCard = (
    toolName: string,
    part: UIMessage["parts"][number],
    key: string,
    messageIndex: number,
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
      const superseded = !completed && isSuperseded(messageIndex);
      const answers = completed
        ? answersFromAskUserOutput(toolPart.output)
        : undefined;
      return (
        <AskUserCard
          key={key}
          questions={questions}
          answers={answers}
          disabled={completed || superseded}
          onComplete={
            completed || superseded
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
      const superseded = !completed && isSuperseded(messageIndex);
      const decision = completed
        ? decisionFromOutput(toolPart.output)
        : undefined;
      return (
        <PlanApprovalCard
          key={key}
          plan={plan}
          completed={completed || superseded}
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
          disabled={isSuperseded(messageIndex)}
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
      className="flex min-h-full flex-col gap-2 p-4"
    >
      {messages.flatMap((message, messageIndex) => {
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
          // Is this turn genuinely live (the stream is open and this is the
          // newest message's last turn)? Frozen tool parts in non-live turns
          // render as interrupted instead of shimmering forever.
          const stillStreaming = status === "submitted" || status === "streaming";
          const isLiveMessage = message.id === messages[messages.length - 1]?.id;
          const isLastTurn = turnIndex === turns.length - 1;
          const isLiveTurn = isLastTurn;
          const responseParts = turn.parts;

          // Tool calls that are not client/approval cards get grouped into
          // step cards so a run reads like a pipeline: tools → answer.
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

          // Task-affinity grouping: consecutive tool calls share ONE step card.
          // Text between calls is the task boundary — the model narrates a new
          // subtask ("Now searching hotels…"), so it closes the open card and
          // opens a new one. Reasoning attaches to the OPEN group (never opens
          // one); the first group's reasoning doubles as lead text.
          interface StepGroup {
            segments: ToolCallStepSegment[];
            /** Narration written between the previous group and this one. */
            leadText: string;
            /** Header: beginTask label, else the narration snippet. */
            title?: string;
          }
          const groups: StepGroup[] = [];
          let openGroup: StepGroup | null = null;
          let pendingReasoning = "";
          let leadText = "";
          let pendingHeader = "";
          responseParts.forEach((part, index) => {
            if (isBeginTask(part)) {
              // Explicit task boundary: close the open card; the label
              // becomes the NEXT card's header.
              if (openGroup) {
                groups.push(openGroup);
                openGroup = null;
              }
              const taskInput = part as { input?: unknown };
              const label =
                taskInput.input != null &&
                typeof taskInput.input === "object" &&
                typeof (taskInput.input as Record<string, unknown>).label === "string"
                  ? ((taskInput.input as Record<string, unknown>).label as string)
                  : "";
              pendingHeader = label || pendingHeader;
              return;
            }
            if (part.type === "text") {
              const text = (part as { text?: string }).text?.trim() ?? "";
              if (!text) return;
              if (openGroup) {
                // Narration between tool calls → close the group, remember
                // the text as the NEXT group's header fallback / lead.
                groups.push(openGroup);
                openGroup = null;
                leadText = text;
                pendingHeader = pendingHeader || truncateHeader(text);
              } else if (groups.length === 0) {
                // Narration before any tool call: plain lead paragraph.
                leadText = leadText ? `${leadText} ${text}` : text;
              } else {
                // Narration after a group was pushed but before new tools:
                // same thing, it leads the upcoming group.
                leadText = text;
                pendingHeader = pendingHeader || truncateHeader(text);
              }
              return;
            }
            if (part.type === "reasoning") {
              const text = (part as { text?: string }).text?.trim() ?? "";
              // Thinking never opens a group — it belongs to the open one
              // (or prefaces the first).
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
            // An incomplete part only means "running" while the turn is
            // genuinely live. After a stop (or an aborted/reloaded turn)
            // frozen input-available parts must render as interrupted —
            // otherwise the shimmer spins forever on a dead call.
            const partIncomplete =
              toolPart.state === "input-available" ||
              toolPart.state === "input-streaming";
            const interrupted =
              partIncomplete &&
              !(stillStreaming && isLiveMessage && isLiveTurn) &&
              // A beginTask-adjacent complete part is impossible: beginTask
              // completes instantly; only in-flight server tools get stuck.
              partIncomplete;
            const segment: ToolCallStepSegment = {
              toolCallId: toolPart.toolCallId ?? `${turnKey}-${index}`,
              toolName,
              input: toolPart.input,
              output: toolPart.output,
              // AI SDK v7 streams: input-streaming → input-available →
              // output-available. Both input states are "running".
              isRunning: partIncomplete && !interrupted,
              isStopped: interrupted,
              isError:
                toolPart.state === "output-error" ||
                toolPart.errorText != null,
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

          const stillRunning =
            isLiveMessage && isLiveTurn && stillStreaming;

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

          if (hasAgentSteps) {
            groups.forEach((group, gi) => {
              const isLastGroup = gi === groups.length - 1;
              const groupLead = group.leadText;
              if (groupLead) {
                bubbleChildren.push(
                  <Markdown key={`${turnKey}-g${gi}-lead`} content={groupLead} />,
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
                    stillRunning && isLastGroup && !group.segments.some((s) => s.isRunning)
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
              // Narration before/between step tools is captured as group
              // leads above; only text after the last step renders here.
              if (hasAgentSteps && partIndex < lastStepIndex) return;
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
            const card = renderClientCard(toolName, part, key, messageIndex);
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
                className={outcome.className ?? "mb-[40px] mt-[20px]"}
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
      {/* {planSteps != null && planSteps.length > 0 && (
        <PlanStepsCard steps={planSteps} />
      )} */}
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
