"use client";

import { getBrowserSupabase } from "@aevryn/auth";
import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { WorkflowDialog } from "@aevryn/ui/components/dialog/workflow-dialog";
import ThinkingIndicator from "@aevryn/ui/components/ui/thinking-indicator";
import type { UIMessage } from "ai";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationTimeline } from "@/components/chat/conversation-timeline";
import { PlanStepsCard } from "@/components/chat/plan-steps-card";
import {
	type ProviderModelOption,
	WorkspaceHeader,
} from "@/components/chat/workspace-header";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { usePlanSteps } from "@/hooks/use-plan-steps";
import { pendingRunFlag } from "@/lib/pending-run";
import {
	fetchProviderModels,
	invalidateProviderModels,
} from "@/lib/provider-models";
import { subscribeToRealtime } from "@/lib/realtime-channel";

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
	}, [threadId, workspaceId]);	// Model list for the header picker. The snapshot is cached module-level
	// (60s TTL) in lib/provider-models; the saved default model wins when no
	// explicit selection was made yet, so it survives refresh.
	const refreshProviders = useCallback(async () => {
		const snapshot = await fetchProviderModels();
		if (!snapshot) return;
		const { options, defaultModel } = snapshot;
		setModels(options);
		setSelectedModel((prev) => {
			if (
				prev &&
				options.some(
					(o) =>
						o.providerSlug === prev.providerSlug &&
						o.modelId === prev.modelId,
				)
			)
				return prev;
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
			onReconnected: () => {
				// The WS was down and something may have changed on the server (run
				// finished on another tab, settings edited). Re-sync header state
				// instead of waiting for a change event that arrived while offline.
				void (async () => {
					try {
						const sidebarRes = await fetch("/api/sidebar", {
							cache: "no-store",
						});
						if (!sidebarRes.ok) return;
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
						const thread = sidebarJson.data.workspaces.some(
							(w) => w.id === workspaceId,
						)
							? sidebarJson.data.threads.find((t) => t.id === threadId)
							: undefined;
						if (thread) {
							setHasBoundWorkflow(thread.boundWorkflowId != null);
							setBoundWorkflowId(thread.boundWorkflowId);
							if (typeof thread.status === "string" && thread.status) {
								setThreadStatus(thread.status);
							}
						}
					} catch {
						// Non-fatal; a later change event re-syncs.
					}
				})();
				void refreshProviders();
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
	}, [threadId, workspaceId, refreshProviders]);

	useEffect(() => {
		void refreshProviders();
	}, [refreshProviders]);

	// The settings dialog lives in the sidebar; when it closes, providers may
	// have been added/removed, so bust the cache and refresh the picker.
	useEffect(() => {
		const onSettingsChanged = () => {
			invalidateProviderModels();
			void refreshProviders();
		};
		window.addEventListener("aevryn:settings-changed", onSettingsChanged);
		return () => {
			window.removeEventListener("aevryn:settings-changed", onSettingsChanged);
		};
	}, [refreshProviders]);

	// Session-only thinking level — not persisted; resets on refresh.
	const [thinkingEffort, setThinkingEffort] = useState("medium");

	// Memoized on primitive deps: the transport rebuilds (and useChat resets)
	// when `model` identity changes, so an inline object that's recreated every
	// render would tear down + rebuild the transport on every keystroke/state
	// change. Derived on the two stable primitives instead.
	const modelOverride = useMemo(
		() =>
			selectedModel
				? {
						providerSlug: selectedModel.providerSlug,
						modelId: selectedModel.modelId,
					}
				: undefined,
		[selectedModel?.providerSlug, selectedModel?.modelId, selectedModel],
	);

	const chat = useAgentChat({
		threadId,
		workspaceId,
		initialMessages: initialMessages ?? undefined,
		mode: hasBoundWorkflow ? "run" : "chat",
		model: modelOverride,
		thinkingEffort,
		enabled: initialMessages !== null,
	});
	const {
		messages,
		status,
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

	// Sidebar/header Run for the thread that is already open here (same tab):
	// the sidebar POSTs /run for validation, then dispatches this event — the
	// POST alone never starts a run, only the trigger message does.
	useEffect(() => {
		const onRunThread = (event: Event) => {
			const detail = (event as CustomEvent<{ threadId?: string }>).detail;
			if (detail?.threadId !== threadId) return;
			if (!hasBoundWorkflow) return;
			if (streamingRef.current) return; // already running here
			setRunError(null);
			resetPlanSteps();
			runWorkflow();
		};
		window.addEventListener("aevryn:run-thread", onRunThread);
		return () => {
			window.removeEventListener("aevryn:run-thread", onRunThread);
		};
	}, [threadId, hasBoundWorkflow, runWorkflow, resetPlanSteps]);

	// Sidebar Run on a thread that was NOT open: the window event fired while
	// this page was still mounting (listener not attached yet), so the intent
	// survived in the sessionStorage pending-run flag instead. Consume it once
	// the thread data is loaded — hasBoundWorkflow must be known, otherwise a
	// bound thread that loads slowly would silently drop the run. The flag
	// self-clears on consume, so a remount can't double-fire; streamingRef
	// covers the (rare) case where this page is somehow already streaming.
	useEffect(() => {
		if (initialMessages === null) return; // thread data not loaded yet
		if (!hasBoundWorkflow) return;
		if (!pendingRunFlag.consume(threadId)) return;
		if (streamingRef.current) return; // already running here
		setRunError(null);
		resetPlanSteps();
		runWorkflow();
	}, [
		threadId,
		hasBoundWorkflow,
		initialMessages,
		runWorkflow,
		resetPlanSteps,
	]);

	const handleOpenSettings = useCallback(() => {
		setSettingsOpen(true);
	}, []);

	// Stable callbacks so ConversationTimeline (memoized) skips re-render
	// churn on unrelated state (thread status heartbeats, provider refresh).
	const handleToolAnswer = useCallback(
		(toolCallId: string, toolName: string, answer: unknown) => {
			sendToolAnswer(toolCallId, toolName, answer);
		},
		[sendToolAnswer],
	);
	const handleApproval = useCallback(
		(toolCallId: string, approved: boolean) => {
			sendApproval(toolCallId, approved);
		},
		[sendApproval],
	);

	const mapStatus = isStreaming
		? "streaming"
		: status === "error"
			? "error"
			: status === "submitted"
				? "submitted"
				: "idle";

	if (loadError) {
		return (
			<div className="flex h-full items-center justify-center p-8 text-muted-foreground text-sm">
				{loadError}
			</div>
		);
	}

	if (initialMessages === null) {
		return (
			<div className="flex h-full items-center justify-center">
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
						className="pointer-events-none flex h-full flex-col items-center justify-center gap-3"
						unselectable="on"
					>
						{/* Both variants rendered; CSS picks by theme — no hydration flash. */}
						{/* Dark theme: icon + wordmark pair. */}
						<div className="hidden flex-wrap items-end justify-center gap-2 md:gap-4 dark:flex">
							<img
								src="/logo-black.svg"
								alt=""
								aria-hidden
								draggable={false}
								className="fade-in h-14 w-auto max-w-[80vw] animate-in select-none opacity-30 duration-500 md:h-24"
							/>
							<img
								src="/aevryn-black.svg"
								alt=""
								aria-hidden
								draggable={false}
								className="fade-in h-10 w-auto max-w-[70vw] animate-in select-none opacity-30 duration-500 md:h-18"
							/>
						</div>
						{/* Light theme: same pair, dark artwork. */}
						<div className="flex flex-wrap items-end justify-center gap-2 md:gap-4 dark:hidden">
							<img
								src="/logo-white.svg"
								alt=""
								aria-hidden
								draggable={false}
								className="fade-in h-14 w-auto max-w-[80vw] animate-in select-none opacity-37 duration-500 md:h-24"
							/>
							<img
								src="/aevryn-white.svg"
								alt=""
								aria-hidden
								draggable={false}
								className="fade-in h-10 w-auto max-w-[70vw] animate-in select-none opacity-37 duration-500 md:h-18"
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
							threadStatus={threadStatus}
							onToolAnswer={handleToolAnswer}
							onApproval={handleApproval}
						/>
					</div>
				)}
			</section>
			<footer className="shrink-0 p-3">
				<div className="mx-auto flex max-w-3xl flex-col gap-3">
					<p className="text-center text-muted-foreground text-xs">
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
