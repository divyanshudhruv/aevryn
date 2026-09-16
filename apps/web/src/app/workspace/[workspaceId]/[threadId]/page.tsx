"use client";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import {
  type ProviderModelOption,
  WorkspaceHeader,
} from "@/components/chat/workspace-header";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { usePlanSteps } from "@/hooks/use-plan-steps";
import { WorkflowDialog } from "@aevryn/ui/components/dialog/workflow-dialog";

export default function ThreadPage() {
  const resolvedParams = useParams<{
    workspaceId: string;
    threadId: string;
  }>();
  const workspaceId = resolvedParams.workspaceId;
  const threadId = resolvedParams.threadId;

  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("Chat");
  const [models, setModels] = useState<ProviderModelOption[]>([]);
  const [selectedModel, setSelectedModel] =
    useState<ProviderModelOption | null>(null);
  const [hasBoundWorkflow, setHasBoundWorkflow] = useState(false);
  const [boundWorkflowId, setBoundWorkflowId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { steps: planSteps } = usePlanSteps(boundWorkflowId);

  // Replay history + header data (thread title, bound workflow) once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [chatRes, sidebarRes] = await Promise.all([
          fetch(`/api/chat?threadId=${encodeURIComponent(threadId)}`, {
            cache: "no-store",
          }),
          fetch("/api/sidebar", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (!chatRes.ok) {
          const body = (await chatRes.json().catch(() => null)) as {
            error?: { code?: string; message?: string } | null;
          } | null;
          const code = body?.error?.code ?? String(chatRes.status);
          if (chatRes.status === 401) {
            throw new Error("Please sign in to view this conversation.");
          }
          throw new Error(
            body?.error?.message ??
              `Could not load this conversation (${code}).`,
          );
        }
        const chatJson = (await chatRes.json()) as {
          data: { messages: UIMessage[] };
        };
        setInitialMessages(chatJson.data.messages);

        if (sidebarRes.ok) {
          const sidebarJson = (await sidebarRes.json()) as {
            data: {
              workspaces: Array<{ id: string }>;
              threads: Array<{
                id: string;
                title: string;
                boundWorkflowId: string | null;
              }>;
            };
          };
          // Threads are workspace-scoped: only valid if the sidebar's
          // selected workspace is this one.
          const belongsToWorkspace = sidebarJson.data.workspaces.some(
            (w) => w.id === workspaceId,
          );
          if (belongsToWorkspace) {
            const thread = sidebarJson.data.threads.find(
              (t) => t.id === threadId,
            );
            if (thread) {
              setTitle(thread.title || "Chat");
              setHasBoundWorkflow(thread.boundWorkflowId != null);
              setBoundWorkflowId(thread.boundWorkflowId);
            }
          }
        }
      } catch (err) {
        if (!cancelled)
          setLoadError(
            err instanceof Error
              ? err.message
              : "Could not load this conversation.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, workspaceId]);

  // Model list for the header picker.
  const refreshProviders = useCallback(async () => {
    const res = await fetch("/api/providers", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as {
      data: Array<{
        slug: string;
        displayName: string;
        models: Array<{ id: string; displayName?: string }>;
      }>;
    };
    const options: ProviderModelOption[] = (json.data ?? []).flatMap(
      (provider) =>
        (provider.models ?? []).map((model) => ({
          providerSlug: provider.slug,
          providerName: provider.displayName,
          modelId: model.id,
          modelName: model.displayName ?? model.id,
        })),
    );
    setModels(options);
    setSelectedModel((prev) => {
      if (prev) {
        const still = options.find(
          (o) =>
            o.providerSlug === prev.providerSlug && o.modelId === prev.modelId,
        );
        if (still) return still;
      }
      return options[0] ?? null;
    });
  }, []);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const chat = useAgentChat({
    threadId,
    workspaceId,
    initialMessages: initialMessages ?? undefined,
    mode: hasBoundWorkflow ? "run" : "chat",
    model: selectedModel
      ? {
          providerSlug: selectedModel.providerSlug,
          modelId: selectedModel.modelId,
        }
      : undefined,
    enabled: initialMessages !== null,
  });

  const {
    messages,
    status,
    error,
    isStreaming,
    sendText,
    sendToolAnswer,
    sendApproval,
    runWorkflow,
    stop,
  } = chat;

  const handleSend = useCallback(
    (text: string) => {
      void sendText(text);
    },
    [sendText],
  );

  const handleRun = useCallback(() => {
    setRunError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/threads/${encodeURIComponent(threadId)}/run`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "run" }),
          },
        );
        const json = (await res.json().catch(() => null)) as {
          error?: { code?: string; message?: string } | null;
        } | null;
        if (!res.ok) {
          const code = json?.error?.code ?? String(res.status);
          if (code === "NO_BOUND_WORKFLOW") {
            setSettingsOpen(true);
            return;
          }
          setRunError(json?.error?.message ?? "Could not start run.");
          return;
        }
        void runWorkflow();
      } catch {
        setRunError("Could not reach the server.");
      }
    })();
  }, [threadId, runWorkflow]);

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const mapStatus = isStreaming
    ? "streaming"
    : status === "error"
      ? "error"
      : status === "submitted"
        ? "submitted"
        : "idle";

  // Descriptive client-facing error: prefer the API's structured message,
  // fall back to the thrown message (skip the SDK's generic placeholder).
  const errorMessage = (() => {
    if (!error) return null;
    const e = error as {
      message?: unknown;
      data?: { error?: { message?: string } };
    };
    const apiMessage = e.data?.error?.message;
    if (typeof apiMessage === "string" && apiMessage.trim().length > 0)
      return apiMessage;
    const msg = e.message;
    if (
      typeof msg === "string" &&
      msg.trim().length > 0 &&
      msg.trim() !== "An error occurred."
    )
      return msg;
    return null;
  })();

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        {loadError}
      </div>
    );
  }

  if (initialMessages === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {" "}
      <WorkspaceHeader
        workspaceId={workspaceId}
        threadId={threadId}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        onRun={hasBoundWorkflow ? handleRun : undefined}
        isRunning={isStreaming}
        runError={runError}
        onOpenSettings={handleOpenSettings}
      />
      <section
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl">
          {" "}
          <ConversationTimeline
            messages={messages}
            status={mapStatus}
            planSteps={planSteps}
            onToolAnswer={(toolCallId, toolName, answer) => {
              sendToolAnswer(toolCallId, toolName, answer);
            }}
            onApproval={(toolCallId, approved) => {
              sendApproval(toolCallId, approved);
            }}
            errorMessage={errorMessage}
          />
        </div>
      </section>
      <footer className="shrink-0 p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <ChatComposer
            status={isStreaming ? "streaming" : "idle"}
            onSend={handleSend}
            onStop={stop}
          />
          <p className=" text-center text-xs text-muted-foreground">
            Aevryn is an AI. check important information before relying on it.
          </p>
        </div>
      </footer>
      <WorkflowDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workflowId={boundWorkflowId}
        threadId={threadId}
        onWorkflowDeleted={() => {
          setBoundWorkflowId(null);
          setHasBoundWorkflow(false);
        }}
      />
    </div>
  );
}
