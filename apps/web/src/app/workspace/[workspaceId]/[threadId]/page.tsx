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
						body?.error?.message ?? `Could not load this conversation (${code}).`,
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
						}
					}
				}
			} catch (err) {
				if (!cancelled)
					setLoadError(
						err instanceof Error ? err.message : "Could not load this conversation.",
					);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [threadId, workspaceId]);

	// Model list for the header picker.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const res = await fetch("/api/providers", { cache: "no-store" });
			if (!res.ok || cancelled) return;
			const json = (await res.json()) as {
				data: Array<{
					slug: string;
					displayName: string;
					models: Array<{ id: string; name: string }>;
				}>;
			};
			const options: ProviderModelOption[] = (json.data ?? []).flatMap(
				(provider) =>
					(provider.models ?? []).map((model) => ({
						providerSlug: provider.slug,
						providerName: provider.displayName,
						modelId: model.id,
						modelName: model.name,
					})),
			);
			if (cancelled) return;
			setModels(options);
			if (options.length > 0) setSelectedModel(options[0]!);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const chat = useAgentChat({
		threadId,
		workspaceId,
		initialMessages: initialMessages ?? undefined,
		mode: hasBoundWorkflow ? "run" : "chat",
		model: selectedModel
			? { providerSlug: selectedModel.providerSlug, modelId: selectedModel.modelId }
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
		stop,
	} = chat;

	const handleSend = useCallback(
		(text: string) => {
			void sendText(text);
		},
		[sendText],
	);

	const handleRun = useCallback(() => {
		// Run mode: prompt the bound workflow without new user text.
		void sendText("Run the workflow.");
	}, [sendText]);

	// Task 10 replaces this placeholder with the real settings dialog.
	const handleOpenSettings = useCallback(() => {
		alert(
			"Settings (Models / BYOK) lands in the next update — Task 10.",
		);
	}, []);

	const mapStatus =
		isStreaming ? "streaming" : status === "error" ? "error" : status === "submitted" ? "submitted" : "idle";

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
		<div className="flex h-full min-h-0 flex-col">				<WorkspaceHeader
					workspaceId={workspaceId}
					threadId={threadId}
					models={models}
					selectedModel={selectedModel}
					onSelectModel={setSelectedModel}
					onRenameTitle={setTitle}
					onRun={hasBoundWorkflow ? handleRun : undefined}
					isRunning={isStreaming}
					onOpenSettings={handleOpenSettings}
				/>
			<section
				aria-label="Conversation"
				className="min-h-0 flex-1 overflow-y-auto"
			>
				<div className="mx-auto max-w-3xl">
					<ConversationTimeline
						messages={messages}
						status={mapStatus}
						onToolAnswer={(toolCallId, toolName, answer) => {
							sendToolAnswer(toolCallId, toolName, answer);
						}}
						onApproval={(toolCallId, approved) => {
							sendApproval(toolCallId, approved);
						}}
					/>
				</div>
			</section>
			<footer className="shrink-0 p-3">
				<div className="mx-auto max-w-3xl">
					<ChatComposer
						status={isStreaming ? "streaming" : "idle"}
						onSend={handleSend}
						onStop={stop}
					/>
					{error ? (
						<p className="mt-2 text-center text-xs text-destructive">
							{(error as Error).message}
						</p>
					) : null}
				</div>
			</footer>
		</div>
	);
}
