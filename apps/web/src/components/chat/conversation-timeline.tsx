"use client";

import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";
import { Markdown } from "@aevryn/ui/components/ui/markdown";
import { SystemMessage } from "@aevryn/ui/components/ui/system-message";
import { ThinkingIndicator } from "@aevryn/ui/components/ui/thinking-indicator";
import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import { type AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";
import {
  ToolCallSequence,
  type ToolCallStepSegment,
} from "@aevryn/ui/components/ui/tool-call-step";
import {
  PlanApprovalCard,
  type PlanDecisionResult,
  type PlanInput,
} from "@aevryn/ui/components/ui/plan-approval-card";
import { PlanStepsCard } from "@/components/chat/plan-steps-card";
import { ApprovalFlow } from "@/components/workspace/approval-flow";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useIcon } from "@aevryn/ui/lib/icon-context";

const CLIENT_TOOLS = new Set(["askUser", "presentPlan"]);
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
  onErrorCta?: () => void;
  errorMessage?: string | null;
}

function systemEventFromOutput(output: unknown): {
  variant: "error" | "warning" | "action";
  message: string;
  ctaLabel?: string;
} | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (record.ok !== false) return null;
  const error = record.error;
  if (error == null || typeof error !== "object") return null;
  const err = error as Record<string, unknown>;
  const code = typeof err.code === "string" ? err.code : "";
  const message =
    typeof err.message === "string" ? err.message : "Tool failed.";

  if (code === "ANAKIN_KEY_REQUIRED" || code === "MEM0_KEY_REQUIRED") {
    return { variant: "warning", message, ctaLabel: "Add key" };
  }
  if (code === "ANAKIN_OUT_OF_CREDITS") {
    return { variant: "error", message, ctaLabel: "Sign up" };
  }
  if (code === "AUTH_REQUIRED") {
    return { variant: "warning", message, ctaLabel: "Connect" };
  }
  return { variant: "error", message };
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
    weekday: "short",
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

export function ConversationTimeline({
  messages,
  status,
  planSteps,
  onToolAnswer,
  onApproval,
  onErrorCta,
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
  }, [messages, status]);

  const activityWords = useMemo(() => {
    // Find the latest running/streaming tool part for the indicator words.
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      for (const part of message.parts) {
        if (
          part.type.startsWith("tool-") &&
          ((part as { state?: string }).state === "input-available" ||
            (part as { state?: string }).state === "input-streaming")
        ) {
          //const toolName = part.type.slice(5);
          return ["Working", "Fetching", "Analyzing"];
          //`Calling ${toolName}`,
        }
      }
    }
    return undefined;
  }, [messages]);

  // Thinking indicator: while submitted (nothing streamed yet) or while
  // streaming before any text/completed tool part exists. Once tool steps
  // render, each step shows its own indicator instead.
  const lastMessage = messages.at(-1);
  const showThinking =
    status === "submitted" ||
    (status === "streaming" &&
      lastMessage?.role === "assistant" &&
      // Tool steps render their own per-step indicators inside the grouped
      // card, so the oversized standalone thinking indicator only shows while
      // nothing has streamed yet.
      !lastMessage.parts.some(
        (p) => p.type === "text" || p.type.startsWith("tool-"),
      ));

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

    if (toolName === "askUser" && toolPart.state !== "output-available") {
      const questions = questionsFromInput(toolPart.input);
      if (!questions) return null;
      return (
        <AskUserCard
          key={key}
          questions={questions}
          onComplete={(answers) => {
            onToolAnswer(toolPart.toolCallId ?? "", "askUser", answers);
          }}
        />
      );
    }

    if (toolName === "presentPlan" && toolPart.state !== "output-available") {
      const plan = planFromInput(toolPart.input);
      if (!plan) return null;
      return (
        <PlanApprovalCard
          key={key}
          plan={plan}
          onDecision={(result: PlanDecisionResult) =>
            onToolAnswer(toolPart.toolCallId ?? "", "presentPlan", result)
          }
        />
      );
    }

    // Completed askUser / presentPlan cards render live again — the user can
    // re-answer them. (The old inert/ResolvedCard freeze is gone; the outcome
    // SystemRow below still carries the human-readable decision text.)
    if (toolName === "askUser" && toolPart.state === "output-available") {
      const questions = questionsFromInput(toolPart.input);
      if (!questions) return null;
      return (
        <AskUserCard
          key={key}
          questions={questions}
          answers={
            toolPart.output != null && typeof toolPart.output === "object"
              ? (toolPart.output as Record<string, AskUserAnswer>)
              : undefined
          }
          onComplete={(answers) => {
            onToolAnswer(toolPart.toolCallId ?? "", "askUser", answers);
          }}
        />
      );
    }

    if (toolName === "presentPlan" && toolPart.state === "output-available") {
      const plan = planFromInput(toolPart.input);
      if (!plan) return null;
      return (
        <PlanApprovalCard
          key={key}
          plan={plan}
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
      className="flex min-h-full flex-col gap-6 p-4"
    >
      {" "}
      {messages.flatMap((message, messageIndex) => {
        const isUser = message.role === "user";

        // System-event rows (completed askUser / presentPlan outcomes)
        // render OUTSIDE the bubble at full width, like the mock.
        const systemRows = message.parts.flatMap((part, partIndex) => {
          if (!part.type.startsWith("tool-")) return [];
          const toolPart = part as {
            state?: string;
            output?: unknown;
          };
          const toolName = part.type.slice(5);
          if (toolPart.state !== "output-available") return [];
          if (toolName !== "askUser" && toolName !== "presentPlan") return [];
          const outcome = clientToolOutcomeRow(toolName, toolPart.output);
          if (!outcome) return [];
          return [
            <SystemMessage
              key={`${message.id}-sys-${partIndex}`}
              fill
              className={outcome.className ?? "mb-[40px]"}
            >
              <p>{outcome.message}</p>
            </SystemMessage>,
          ];
        });

        // One assistant turn = ONE ChatMessage: every sequential tool run of
        // the same response stays grouped in a single bubble (its step card
        // already orders them as a pipeline). Separate user prompts produce
        // separate messages, and therefore separate bubbles.
        const responses: UIMessage["parts"][] = [message.parts];

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
          return systemRows;
        }

        return [
          ...systemRows,
          ...responses.map((responseParts, responseIndex) => {
            const isLastResponse = responseIndex === responses.length - 1;
            const responseKey = message.id;

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
            const firstSegIndex = hasAgentSteps ? segParts[0]!.index : -1;

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
                  toolCallId: toolPart.toolCallId ?? `${responseKey}-${index}`,
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

            // Text the model wrote BEFORE its first tool call doubles as the
            // card title — fully model-authored, no hardcoded agent/user names.
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
              isLastResponse &&
              (status === "submitted" || status === "streaming");

            const responseText = isUser
              ? ""
              : responseParts
                  .filter((p) => p.type === "text")
                  .map((p) => (p as { text?: string }).text ?? "")
                  .join("\n");

            // Usage is a per-message (per-turn) figure from the stream's
            // finish event — show it once, on the turn's final bubble.
            const assistantUsage = isLastResponse
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
              bubbleChildren.push(
                <ToolCallSequence
                  key={`${responseKey}-steps`}
                  title={leadText}
                  steps={segments}
                  answerStep={
                    stillRunning ||
                    responseParts.some((p) => p.type === "text")
                  }
                  answerRunning={
                    stillRunning && !segments.some((s) => s.isRunning)
                  }
                />,
              );
            }

            responseParts.forEach((part, partIndex) => {
              const key = `${responseKey}-${partIndex}`;

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

            if (bubbleChildren.length === 0) return null;

            return (
              <ChatMessage
                key={responseKey}
                from={isUser ? "user" : "assistant"}
                time={messageTimestamp(message)}
                actions={
                  !isUser && responseText.trim().length > 0 ? (
                    <AssistantActions
                      text={responseText}
                      usage={assistantUsage}
                    />
                  ) : undefined
                }
              >
                {bubbleChildren}
              </ChatMessage>
            );
          }),
        ];
      })}
      {showThinking && (
        <ThinkingIndicator
          words={activityWords ?? ["Thinking", "Planning", "Refining"]}
        />
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

/** Hover action bar under an assistant message: token usage + copy. */
function AssistantActions({
  text,
  usage,
}: {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
}) {
  const Copy = useIcon("copy");
  const Check = useIcon("check");
  const [copied, setCopied] = useState(false);

  const usageLabel =
    usage?.totalTokens != null && usage.totalTokens > 0
      ? `${usage.totalTokens.toLocaleString()} tokens`
      : undefined;

  return (
    <>
      {usageLabel && (
        <span
          className="text-[11px] tabular-nums text-muted-foreground select-none"
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
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
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
    </>
  );
}

function AskUserCard({
  questions,
  answers,
  onComplete,
}: {
  questions: Array<Record<string, unknown>>;
  answers?: Record<string, AskUserAnswer>;
  onComplete: (answers: Record<string, AskUserAnswer>) => void;
}) {
  return (
    <QuestionFlow
      // The UI component's contract: AskUserQuestion[] minus view-only fields.
      questions={questions as never}
      defaultAnswers={answers as never}
      onComplete={onComplete}
    />
  );
}
