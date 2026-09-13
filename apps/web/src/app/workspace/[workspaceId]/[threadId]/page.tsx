"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase-client";
import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";
import { SystemMessage } from "@aevryn/ui/components/ui/system-message";
import { ThinkingIndicator } from "@aevryn/ui/components/ui/thinking-indicator";
import {
  AccordionGroup,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@aevryn/ui/components/ui/accordion";
import { ToolStepList } from "@/components/workspace/activity-steps";
import { ApprovalFlow } from "@/components/workspace/approval-flow";

type ThreadModel = {
  thread: {
    id: string;
    workspaceId: string;
    title: string;
  };
  binding: {
    workflowId: string;
    workflow: { id: string; title: string; status: string };
    planSteps: Array<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      position: number;
    }>;
  } | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: Array<{ type: string; text?: string }>;
    status: string;
    runId: string | null;
    createdAt: string;
  }>;
  run: { id: string; status: string; createdAt: string } | null;
  activities: Array<{
    id: string;
    type: string;
    status: string;
    stepLabel: string | null;
    title: string | null;
    description: string | null;
    createdAt: string;
  }>;
  approvals: Array<{
    id: string;
    runId: string;
    toolName: string;
    input: unknown;
    status: string;
    createdAt: string;
  }>;
  queue: {
    busy: boolean;
    pendingCount: number;
    pendingItems: Array<{ id: string; text: string }>;
  };
  schedules: Array<{
    id: string;
    cron: string | null;
    intervalSeconds: number | null;
    nextRunAt: string | null;
    enabled: boolean;
  }>;
};

function textOf(content: Array<{ type: string; text?: string }>): string {
  return (
    content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join(" ") || ""
  );
}

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ThreadPage() {
  const params = useParams<{
    workspaceId: string;
    threadId: string;
  }>();
  const threadId = params?.threadId ?? "";
  const [model, setModel] = useState<ThreadModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/threads/${threadId}/model`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setLoadError("Thread not found.");
        return;
      }
      if (!res.ok) {
        setLoadError("Could not load this thread.");
        return;
      }
      const json = (await res.json()) as { data: ThreadModel };
      setModel(json.data);
      setLoadError(null);
    } catch {
      setLoadError("Could not load this thread.");
    }
  }, [threadId]);

  // Initial fetch + Supabase Realtime refresh for the tables the thread
  // page reads. The socket is never the only source of truth — it just
  // triggers refetches of the one read model.
  useEffect(() => {
    void refresh();
    const channel = supabaseClient
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "runs",
          filter: `thread_id=eq.${threadId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "run_activities",
          filter: `run_id=eq.${model?.run?.id ?? "none"}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [threadId, refresh]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [model?.messages.length, model?.activities.length]);

  const runActive =
    model?.run != null &&
    (model.run.status === "running" ||
      model.run.status === "awaiting_approval");

  const handleSend = useCallback(
    async (text: string) => {
      setSubmitting(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            threadId,
            workspaceId: model?.thread.workspaceId,
            message: text,
          }),
        });
        if (res.ok) {
          // The optimistic user message comes back from the model
          // refresh; trigger it immediately.
          void refresh();
        }
      } finally {
        setSubmitting(false);
      }
    },
    [threadId, model?.thread.workspaceId, refresh],
  );

  const handleStop = useCallback(async () => {
    if (!model?.run) return;
    await fetch(`/api/runs/${model.run.id}/stop`, { method: "POST" });
    void refresh();
  }, [model?.run, refresh]);

  const handleApproval = useCallback(
    async (approvalId: string, decision: "approved" | "denied") => {
      await fetch(`/api/approvals/${approvalId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      void refresh();
    },
    [refresh],
  );

  // ArrowUp history comes from the composer's own transcript state; the
  // server messages feed the transcript, not the composer.
  const userHistory = useMemo(
    () =>
      (model?.messages ?? [])
        .filter((m) => m.role === "user")
        .map((m) => textOf(m.content))
        .filter(Boolean),
    [model?.messages],
  );
  void userHistory;

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <SystemMessage variant="error" fill>
          <p>{loadError}</p>
        </SystemMessage>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col w-full">
      <section
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end">
          <div className="p-4">
            <div className="flex flex-col gap-2">
              {!model && <ThinkingIndicator />}
              {model?.messages.map((message) => {
                if (message.role === "system") {
                  return (
                    <SystemMessage key={message.id} fill className="mb-[40px]">
                      <p>{textOf(message.content)}</p>
                    </SystemMessage>
                  );
                }
                const text = textOf(message.content);
                const isLastAssistant =
                  message.role === "assistant" &&
                  message.id === model.messages.at(-1)?.id;
                return (
                  <ChatMessage
                    key={message.id}
                    from={message.role === "user" ? "user" : "assistant"}
                    time={timeLabel(message.createdAt)}
                  >
                    {/* Live run trace sits ABOVE the assistant text it belongs to */}
                    {isLastAssistant && model.activities.length > 0 && (
                      <div className="mb-3 flex flex-col gap-1">
                        <ToolStepList activities={model.activities} />
                      </div>
                    )}
                    {message.status === "streaming" && isLastAssistant ? (
                      <ThinkingIndicator />
                    ) : (
                      text || (isLastAssistant ? <ThinkingIndicator /> : null)
                    )}
                  </ChatMessage>
                );
              })}

              {/* Pending approvals render as question cards */}
              {model?.approvals.map((approval) => (
                <ApprovalFlow
                  key={approval.id}
                  toolName={approval.toolName}
                  input={approval.input}
                  onDecide={(decision: "approved" | "denied") =>
                    void handleApproval(approval.id, decision)
                  }
                />
              ))}

              {/* Bound workflow plan review */}
              {model?.binding && model.binding.planSteps.length > 0 && (
                <div className="w-full py-2">
                  <AccordionGroup type="single" className="w-full" collapsible>
                    {model.binding.planSteps.map((step, i) => (
                      <AccordionItem key={step.id} value={step.id} index={i}>
                        <AccordionTrigger>
                          {step.status === "completed" ? "✓ " : ""}
                          {step.title}
                        </AccordionTrigger>
                        <AccordionContent>
                          {step.description ?? ""}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </AccordionGroup>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      </section>

      <footer className="shrink-0 p-3 ">
        <div className="mx-auto max-w-3xl w-full">
          <ChatComposer
            onSend={(text) => void handleSend(text)}
            onStop={runActive ? handleStop : undefined}
            status={runActive || submitting ? "streaming" : "idle"}
          />
        </div>
      </footer>
    </div>
  );
}
