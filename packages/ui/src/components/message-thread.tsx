"use client";

import type { StepCall, ThreadMessage } from "@aevryn/ui/lib/chat-types";
import type { StepStatus } from "@aevryn/ui/components/ui/thinking-steps";
import {
  ThinkingSteps,
  ThinkingStepsHeader,
  ThinkingStepsContent,
  ThinkingStep,
} from "@aevryn/ui/components/ui/thinking-steps";
import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";
import {
  ToolStepCard,
  toolIconFor,
  toolDisplayName,
} from "@aevryn/ui/components/tool-step-card";
import { cn } from "@aevryn/ui/lib/utils";
import { useIcon } from "@aevryn/ui/lib/icon-context";

interface Group {
  toolName: string;
  calls: StepCall[];
}

/** Consecutive runs of the same tool collapse into a single thinking step
 *  with the individual calls nested underneath (see spec E). */
function groupToolCalls(calls: StepCall[]): Group[] {
  const groups: Group[] = [];
  for (const call of calls) {
    const last = groups[groups.length - 1];
    if (last && last.toolName === call.toolName) {
      last.calls.push(call);
    } else {
      groups.push({ toolName: call.toolName, calls: [call] });
    }
  }
  return groups;
}

function groupStepStatus(group: Group): StepStatus {
  return group.calls.some((c) => c.status === "running") ? "active" : "complete";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ToolSteps({ calls }: { calls: StepCall[] }) {
  const groups = groupToolCalls(calls);
  return (
    <ThinkingSteps defaultOpen className="w-full max-w-full">
      <ThinkingStepsHeader>
        {groups.length === 1 ? "1 step" : `${groups.length} steps`}
      </ThinkingStepsHeader>
      <ThinkingStepsContent className="gap-0">
        {groups.map((group, gi) => {
          const isLast = gi === groups.length - 1;
          const failed = group.calls.some((c) => c.status === "failed");
          if (group.calls.length === 1) {
            const call = group.calls[0]!;
            return (
              <ThinkingStep
                key={call.id}
                icon={toolIconFor(group.toolName)}
                label={toolDisplayName(group.toolName)}
                status={groupStepStatus(group)}
                isLast={isLast}
                description={failed ? "failed" : undefined}
              >
                <ToolStepCard step={call} />
              </ThinkingStep>
            );
          }
          return (
            <ThinkingStep
              key={`${group.toolName}-${gi}`}
              icon={toolIconFor(group.toolName)}
              label={toolDisplayName(group.toolName)}
              status={groupStepStatus(group)}
              isLast={isLast}
              description={`${group.calls.length} calls${failed ? " · failed" : ""}`}
            >
              {group.calls.map((call, i) => (
                <ToolStepCard key={call.id} step={call} index={i + 1} />
              ))}
            </ThinkingStep>
          );
        })}
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}

interface MessageThreadProps {
  messages: ThreadMessage[];
  className?: string;
}

/** Ordered transcript: user prompts as bubbles, assistant replies as bubbles
 *  with their tool/step calls rendered as collapsible thinking steps above the
 *  final response. */
export function MessageThread({ messages, className }: MessageThreadProps) {
  const CopyIcon = useIcon("copy");
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {messages.map((message) => {
        const isUser = message.role === "user";
        const tools = message.toolCalls;
        const body = message.content;
        if (!isUser && !body?.trim() && (!tools || tools.length === 0)) {
          return null;
        }
        const actions = body?.trim() ? (
          <button
            type="button"
            aria-label="Copy message"
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => void navigator.clipboard.writeText(body)}
          >
            <CopyIcon className="size-3.5" />
          </button>
        ) : null;
        return (
          <div
            key={message.id}
            className={cn(
              "flex w-full flex-col",
              isUser ? "items-end" : "items-start",
              "gap-1.5",
            )}
          >
            {!isUser && tools && tools.length > 0 && (
              <ToolSteps calls={tools} />
            )}
            {!isUser && !body?.trim() ? null : (
              <ChatMessage
                from={isUser ? "user" : "assistant"}
                time={formatTime(message.createdAt)}
                actions={actions}
              >
                {body}
              </ChatMessage>
            )}
          </div>
        );
      })}
    </div>
  );
}

MessageThread.displayName = "MessageThread";