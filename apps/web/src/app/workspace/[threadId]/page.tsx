"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";
import {
  SidebarInset,
  SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceHeader } from "@/components/workspace-header";
import { trpc, queryClient } from "@/utils/trpc";
import { useThreadStore } from "@/stores/thread-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import {
  useMessageStore,
  type Message,
  type StepCall,
} from "@/stores/message-store";

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params.threadId;

  const { updateThread } = useThreadStore();
  const { setWorkflow } = useWorkflowStore();
  const { setMessages } = useMessageStore();

  const { data, isLoading } = useQuery(
    trpc.agent.getThread.queryOptions({ workflowId: threadId }),
  );

  useEffect(() => {
    if (!data) return;
    updateThread(threadId, {
      objective: data.workflow.objective ?? "Untitled thread",
      status: data.workflow.status,
    });
    setWorkflow(threadId, {
      id: data.workflow.id,
      threadId,
      status: data.workflow.status,
      objective: data.workflow.objective ?? "",
      createdAt: data.workflow.createdAt,
    });
  }, [data, threadId, updateThread, setWorkflow]);

  useEffect(() => {
    if (!data) return;
    const built: Message[] = [];
    for (const turn of data.turns) {
      built.push({
        id: `user-${turn.execution.id}`,
        threadId,
        role: "user",
        content: turn.prompt ?? "",
        createdAt: toIsoOrNow(turn.execution.startedAt),
      });
      const assistantText = turn.steps
        .map((s) => s.text)
        .filter(Boolean)
        .join("\n");
      const toolCalls: StepCall[] = turn.toolExecutions.map((tool) => ({
        id: tool.id,
        toolName: tool.tool,
        input: (tool.input as Record<string, unknown>) ?? {},
        status:
          tool.status === "called"
            ? "running"
            : tool.status === "completed"
              ? "completed"
              : "failed",
        output: tool.output
          ? JSON.stringify(tool.output).slice(0, 2000)
          : undefined,
        startedAt: new Date().toISOString(),
      }));
      built.push({
        id: `assistant-${turn.execution.id}`,
        threadId,
        role: "assistant",
        content: assistantText,
        createdAt: toIsoOrNow(turn.execution.completedAt ?? turn.execution.startedAt),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }
    setMessages(threadId, built);
  }, [data, threadId, setMessages]);

  const sendMessage = useMutation(
    trpc.agent.sendMessage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [["agent.getThread"]],
        });
        queryClient.invalidateQueries({
          queryKey: [["agent.listRuns"]],
        });
      },
    }),
  );

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex h-full min-h-0 flex-col">
          <WorkspaceHeader />
          <section
            aria-label="Conversation"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex min-h-full max-w-3xl flex-col">
              <div className="flex-1 p-4">
                {isLoading && !data ? (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">
                    Loading thread…
                  </p>
                ) : (
                  <ThreadMessages threadId={threadId} />
                )}
              </div>
            </div>
          </section>
          <footer className="shrink-0 p-3">
            <div className="mx-auto max-w-3xl">
              <ChatComposer
                demo={false}
                onSubmitMessage={(text) =>
                  sendMessage.mutate({ workflowId: threadId, message: text })
                }
              />
            </div>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ThreadMessages({ threadId }: { threadId: string }) {
  const messages = useMessageStore((s) => s.messagesByThread[threadId] ?? []);

  if (messages.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground">
        Send a message to start working with Aevryn.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          from={message.role === "user" ? "user" : "assistant"}
          time={formatTime(message.createdAt)}
        >
          <span className="whitespace-pre-wrap break-words">
            {message.content || "…"}
          </span>
        </ChatMessage>
      ))}
    </div>
  );
}

function toIsoOrNow(value: string | null | undefined): string {
  return value ?? new Date().toISOString();
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}