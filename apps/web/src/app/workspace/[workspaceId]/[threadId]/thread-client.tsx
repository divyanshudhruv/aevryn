"use client";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

import { getBrowserSupabase } from "@aevryn/auth";
import { subscribeToRealtime } from "@/lib/realtime-channel";
import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import {
  type ProviderModelOption,
  WorkspaceHeader,
} from "@/components/chat/workspace-header";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { usePlanSteps } from "@/hooks/use-plan-steps";
import { WorkflowDialog } from "@aevryn/ui/components/dialog/workflow-dialog";
import { PlanStepsCard } from "@/components/chat/plan-steps-card";
import ThinkingIndicator from "@aevryn/ui/components/ui/thinking-indicator";

export function ThreadClient() {
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
  const [threadStatus, setThreadStatus] = useState<string>("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { steps: planSteps, reset: resetPlanSteps } =
    usePlanSteps(boundWorkflowId);

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
                status?: string;
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
              if (typeof thread.status === "string" && thread.status) {
                setThreadStatus(thread.status);
              }
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

  // Live thread status (run in progress on another tab, side effects from
  // the server, etc.) so the Run button reflects reality without a refresh.
  useEffect(() => {
    if (!threadId) return;
    const supabase = getBrowserSupabase();
    const unsubscribe = subscribeToRealtime({
      supabase,
      channelName: `thread-status:${threadId}`,
      config: {
        event: "UPDATE",
        schema: "public",
        table: "threads",
        filter: `id=eq.${threadId}`,
      },
      onStatus: (status) => {
        if (status === "CHANNEL_ERROR" || status === "SUBSCRIBE_ERROR") {
          console.error("[page] thread status channel failed", status);
        }
      },
      onEvent: ({ new: row }) => {
        if (typeof row?.status === "string" && row.status) {
          setThreadStatus(row.status);
          if (typeof row.bound_workflow_id === "string") {
            setBoundWorkflowId(row.bound_workflow_id);
            setHasBoundWorkflow(row.bound_workflow_id != null);
          }
        }
      },
    });
    return () => {
      unsubscribe();
    };
  }, [threadId]);

  // Model list for the header picker. Prefers the saved default model when
  // no selection was made yet, so it survives refresh.
  const refreshProviders = useCallback(async () => {
    const [providersRes, settingsRes] = await Promise.all([
      fetch("/api/providers", { cache: "no-store" }),
      fetch("/api/settings", { cache: "no-store" }),
    ]);
    if (!providersRes.ok) return;
    const json = (await providersRes.json()) as {
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
    const settingsJson = (await settingsRes.json().catch(() => null)) as {
      data?: {
        defaultModel?: { providerSlug: string; modelId: string } | null;
      };
    } | null;
    const defaultModel = settingsJson?.data?.defaultModel ?? null;
    setModels(options);
    setSelectedModel((prev) => {
      if (prev) {
        const still = options.find(
          (o) =>
            o.providerSlug === prev.providerSlug && o.modelId === prev.modelId,
        );
        if (still) return still;
      }
      const preferred =
        defaultModel &&
        options.find(
          (o) =>
            o.providerSlug === defaultModel.providerSlug &&
            o.modelId === defaultModel.modelId,
        );
      return preferred ?? options[0] ?? null;
    });
  }, []);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  // The settings dialog lives in the sidebar; when it closes, providers may
  // have been added/removed, so refresh the header's model picker.
  useEffect(() => {
    const onSettingsChanged = () => {
      void refreshProviders();
    };
    window.addEventListener("aevryn:settings-changed", onSettingsChanged);
    return () => {
      window.removeEventListener("aevryn:settings-changed", onSettingsChanged);
    };
  }, [refreshProviders]);

  // Session-only thinking level — not persisted; resets on refresh.
  const [thinkingEffort, setThinkingEffort] = useState("medium");

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
    thinkingEffort,
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
  ); // A stop from the sidebar (or another tab) flips the thread status over
  // realtime; if a stream is still open here, close it too so the timeline,
  // cards, and composer all settle together.
  const statusRef = useRef(threadStatus);
  statusRef.current = threadStatus;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const streamingRef = useRef(isStreaming);
  streamingRef.current = isStreaming;
  useEffect(() => {
    if (
      streamingRef.current &&
      (threadStatus === "idle" || threadStatus === "failed")
    ) {
      stopRef.current();
    }
    // threadStatus is the trigger; the refs avoid stale closures.
  }, [threadStatus]);

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
        // A fresh run starts at step 1: flip the slider back before the
        // agent's updateStepStatus writes arrive over realtime.
        resetPlanSteps();
        void runWorkflow();
      } catch {
        setRunError("Could not reach the server.");
      }
    })();
  }, [threadId, runWorkflow, resetPlanSteps]);

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
      <div className="flex h-full items-center justify-center ">
        <ThinkingIndicator words={["Loading your conversation..."]} />
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
        isRunning={
          isStreaming ||
          threadStatus === "running" ||
          threadStatus === "retrying" ||
          threadStatus === "sleeping"
        }
        runError={runError}
        onOpenSettings={handleOpenSettings}
      />
      <section
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {messages.length === 0 && !isStreaming ? (
          // Brand-new thread: centered theme-aware logo so the canvas
          // doesn't look empty. Vanishes the moment the first message is
          // sent (messages.length grows / streaming starts).
          <div
            className="flex h-full flex-col items-center justify-center gap-4 pointer-events-none"
            unselectable="on"
          >
            {/* Both variants rendered; CSS picks by theme — no hydration flash. */}
            {/* Dark theme: icon + wordmark pair. */}
            <div className="hidden items-end justify-center gap-4 dark:flex">
              <img
                src="/logo-black.svg"
                alt=""
                aria-hidden
                draggable={false}
                className="h-24 w-auto animate-in fade-in opacity-30 duration-500 select-none"
              />
              <img
                src="/aevryn-black.svg"
                alt=""
                aria-hidden
                draggable={false}
                className="h-18 w-auto animate-in fade-in opacity-30 duration-500 select-none"
              />
            </div>
            {/* Light theme: same pair, dark artwork. */}
            <div className="flex items-end justify-center gap-4 dark:hidden">
              <img
                src="/logo-white.svg"
                alt=""
                aria-hidden
                draggable={false}
                className="h-24 w-auto animate-in fade-in opacity-37 duration-500 select-none"
              />
              <img
                src="/aevryn-white.svg"
                alt=""
                aria-hidden
                draggable={false}
                className="h-18 w-auto animate-in fade-in opacity-37 duration-500 select-none"
              />
            </div>

            {/* <p className="animate-in fade-in slide-in-from-bottom-1 text-sm text-muted-foreground duration-700">
              How can I help you today?
            </p> */}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            {" "}
            <ConversationTimeline
              messages={messages}
              status={mapStatus}
              planSteps={planSteps}
              threadStatus={threadStatus}
              onToolAnswer={(toolCallId, toolName, answer) => {
                sendToolAnswer(toolCallId, toolName, answer);
              }}
              onApproval={(toolCallId, approved) => {
                sendApproval(toolCallId, approved);
              }}
              errorMessage={errorMessage}
            />
          </div>
        )}
      </section>
      <footer className="shrink-0 p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <p className=" text-center text-xs text-muted-foreground">
            Aevryn is an AI. Check important information before relying on it.
          </p>{" "}
          {planSteps != null && planSteps.length > 0 && (
            <PlanStepsCard steps={planSteps} />
          )}
          <ChatComposer
            status={isStreaming ? "streaming" : "idle"}
            onSend={handleSend}
            onStop={stop}
            onThinkingChange={setThinkingEffort}
          />
        </div>
      </footer>
      <WorkflowDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) void refreshProviders();
        }}
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
