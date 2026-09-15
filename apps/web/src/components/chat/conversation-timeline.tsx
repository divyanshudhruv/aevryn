"use client";

import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";
import { Markdown } from "@aevryn/ui/components/ui/markdown";
import { SystemMessage } from "@aevryn/ui/components/ui/system-message";
import { ThinkingIndicator } from "@aevryn/ui/components/ui/thinking-indicator";
import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import { type AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";
import {
  ToolCallStep,
  type ToolCallView,
} from "@aevryn/ui/components/ui/tool-call-step";
import {
  PlanApprovalCard,
  type PlanDecisionResult,
  type PlanInput,
} from "@aevryn/ui/components/ui/plan-approval-card";
import { ApprovalFlow } from "@/components/workspace/approval-flow";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useIcon } from "@aevryn/ui/lib/icon-context";

const CLIENT_TOOLS = new Set(["askUser", "presentPlan"]);
const APPROVAL_TOOLS = new Set(["wireAction", "wireBuildRequest"]);

interface TimelineProps {
  messages: UIMessage[];
  status: "idle" | "streaming" | "submitted" | "error";
  onToolAnswer: (toolCallId: string, toolName: string, answer: unknown) => void;
  onApproval: (toolCallId: string, approved: boolean) => void;
  onErrorCta?: () => void;
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
  onToolAnswer,
  onApproval,
  onErrorCta,
}: TimelineProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // Auto-scroll: snap to bottom whenever content grows or streaming state
  // changes. Use instant scroll while streaming (smooth lags bursts).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      240;
    bottomRef.current?.scrollIntoView({
      behavior: status === "streaming" && !nearBottom ? "smooth" : "instant",
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
      !lastMessage.parts.some(
        (p) =>
          p.type === "text" ||
          (p.type.startsWith("tool-") &&
            (p as { state?: string }).state === "output-available"),
      ));

  return (
    <div
      ref={(node) => {
        scrollContainerRef.current = node?.parentElement ?? null;
      }}
      className="flex min-h-full flex-col gap-6 p-4"
    >
      {" "}
      {messages.map((message) => {
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

        const bubbleParts = message.parts.filter((part) => {
          if (!part.type.startsWith("tool-")) return true;
          const toolPart = part as {
            state?: string;
            output?: unknown;
          };
          const toolName = part.type.slice(5);
          if (
            (toolName === "askUser" || toolName === "presentPlan") &&
            toolPart.state === "output-available"
          ) {
            return clientToolOutcomeRow(toolName, toolPart.output) == null;
          }
          return true;
        });

        // Render each message as a ChatMessage with its parts as children.
        // Assistant messages get a hover action bar (copy).
        const assistantText = isUser
          ? ""
          : bubbleParts
              .filter((p) => p.type === "text")
              .map((p) => (p as { text?: string }).text ?? "")
              .join("\n");
        return (
          <div key={message.id} className="flex min-w-0 flex-col gap-4">
            <ChatMessage
              from={isUser ? "user" : "assistant"}
              time={new Date().toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
              actions={
                !isUser && assistantText.trim().length > 0 ? (
                  <AssistantActions text={assistantText} />
                ) : undefined
              }
            >
              {bubbleParts.map((part, partIndex) => {
                const key = `${message.id}-${partIndex}`;

                if (part.type === "text") {
                  const text = (part as { text: string }).text;
                  if (!text) return null;
                  return isUser ? (
                    <div key={key} className="whitespace-pre-wrap">
                      {text}
                    </div>
                  ) : (
                    <Markdown key={key} content={text} />
                  );
                }

                if (part.type.startsWith("tool-")) {
                  const toolPart = part as {
                    type: string;
                    state?: string;
                    toolCallId?: string;
                    input?: unknown;
                    output?: unknown;
                    errorText?: string;
                  };
                  const toolName = part.type.slice(5);

                  // Client tools render their own interactive cards.
                  if (
                    toolName === "askUser" &&
                    toolPart.state !== "output-available"
                  ) {
                    const questions = questionsFromInput(toolPart.input);
                    if (!questions) return null;
                    return (
                      <AskUserCard
                        key={key}
                        questions={questions}
                        onComplete={(answers) => {
                          onToolAnswer(
                            toolPart.toolCallId ?? "",
                            "askUser",
                            answers,
                          );
                        }}
                      />
                    );
                  }

                  if (
                    toolName === "presentPlan" &&
                    toolPart.state !== "output-available"
                  ) {
                    const plan = planFromInput(toolPart.input);
                    if (!plan) return null;
                    return (
                      <PlanApprovalCard
                        key={key}
                        plan={plan}
                        onDecision={(result: PlanDecisionResult) =>
                          onToolAnswer(
                            toolPart.toolCallId ?? "",
                            "presentPlan",
                            result,
                          )
                        }
                      />
                    );
                  }

                  // Completed askUser / presentPlan outcomes already render
                  // as full-width SystemRows outside the bubble.
                  if (
                    (toolName === "askUser" || toolName === "presentPlan") &&
                    toolPart.state === "output-available"
                  ) {
                    return null;
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
                          onApproval(
                            toolPart.toolCallId ?? "",
                            decision === "approved",
                          )
                        }
                      />
                    );
                  }

                  const view: ToolCallView = {
                    toolCallId: toolPart.toolCallId ?? key,
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
                  return <ToolCallStep key={key} call={view} />;
                }

                return null;
              })}
            </ChatMessage>
            {systemRows}
          </div>
        );
      })}
      {showThinking && (
        <ChatMessage from="assistant">
          <ThinkingIndicator
            words={activityWords ?? ["Thinking", "Planning", "Refining"]}
          />
        </ChatMessage>
      )}
      {status === "error" && (
        <SystemMessage variant="error" fill>
          Something went wrong with this turn. Try again.
        </SystemMessage>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

/** Hover action bar under an assistant message: copy to clipboard. */
function AssistantActions({ text }: { text: string }) {
  const Copy = useIcon("copy");
  const Check = useIcon("check");
  const [copied, setCopied] = useState(false);

  return (
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
  );
}

function AskUserCard({
  questions,
  onComplete,
}: {
  questions: Array<Record<string, unknown>>;
  onComplete: (answers: Record<string, AskUserAnswer>) => void;
}) {
  return (
    <QuestionFlow
      // The UI component's contract: AskUserQuestion[] minus view-only fields.
      questions={questions as never}
      onComplete={onComplete}
    />
  );
}
