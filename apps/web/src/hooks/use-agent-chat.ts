"use client";

import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithApprovalResponses,
	type UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo } from "react";

export type AgentMode = "chat" | "run";

export interface UseAgentChatOptions {
	threadId: string;
	workspaceId: string;
	initialMessages?: UIMessage[];
	mode?: AgentMode;
	model?: { providerSlug?: string; modelId?: string };
	/** Session-only thinking effort (Free→God). Not persisted; resets to
	 *  default per session. Silently ignored by models without reasoning. */
	thinkingEffort?: string;
	enabled?: boolean;
}

export function useAgentChat({
	threadId,
	workspaceId,
	initialMessages,
	mode = "chat",
	model,
	thinkingEffort,
	enabled = true,
}: UseAgentChatOptions) {
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				body: { threadId, workspaceId, mode, model, thinkingEffort },
			}),
		[threadId, workspaceId, mode, model, thinkingEffort],
	);

	const chat = useChat({
		transport,
		messages: initialMessages,
		// Resume the loop ONLY when a client tool got its answer
		// (askUser / presentPlan) or a native approval was decided.
		// Deliberately NOT lastAssistantMessageIsCompleteWithToolCalls: that
		// helper treats ANY completed tool part in the last model step —
		// including server tools like searchWeb — as resumable, so every turn
		// that ended after server tool calls re-submitted itself and the
		// whole turn (text, step cards, answered cards) rendered twice.
		sendAutomaticallyWhen: ({ messages: current }) => {
			// Native tool approvals (wireAction etc.) keep the SDK helper.
			if (
				lastAssistantMessageIsCompleteWithApprovalResponses({
					messages: current,
				})
			) {
				return true;
			}
			const last = current[current.length - 1];
			if (last?.role !== "assistant") return false;
			// Only the model's FINAL step matters: if the model already
			// produced a later step, the answered card was consumed.
			const lastStepStart = last.parts.reduce(
				(idx, p, i) => (p.type === "step-start" ? i : idx),
				-1,
			);
			return last.parts
				.slice(lastStepStart + 1)
				.some(
					(p) =>
						(p.type === "tool-askUser" || p.type === "tool-presentPlan") &&
						(p as { state?: string }).state === "output-available",
				);
		},
		onError: (err) => {
			console.error("[use-agent-chat] stream error", err);
		},
	});

	const {
		sendMessage,
		addToolOutput,
		addToolApprovalResponse,
		messages,
		status,
		error,
		stop,
		setMessages,
	} = chat;

	// Replay: when thread history arrives after mount (async GET), hydrate once.
	useEffect(() => {
		if (!enabled || !initialMessages?.length) return;
		setMessages((current) => (current.length > 0 ? current : initialMessages));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled, initialMessages, setMessages]);

	const sendText = useCallback(
		(text: string) => {
			sendMessage({ text });
		},
		[sendMessage],
	);

	/** Run trigger: an explicit user message the system prompt's Run-mode
	 *  section instructs the agent to treat as "execute the bound workflow". */
	const runWorkflow = useCallback(() => {
		sendMessage({ text: "Run the bound workflow from step 1." }).catch(
			() => undefined,
		);
	}, [sendMessage]);

	const sendToolAnswer = useCallback(
		(toolCallId: string, toolName: string, answer: unknown) => {
			addToolOutput({
				tool: toolName as never,
				toolCallId,
				state: "output-available",
				output: answer,
			});
		},
		[addToolOutput],
	);

	const sendApproval = useCallback(
		(toolCallId: string, approved: boolean, reason?: string) => {
			addToolApprovalResponse({
				id: toolCallId,
				approved,
				...(reason ? { reason } : {}),
			});
		},
		[addToolApprovalResponse],
	);

	return {
		messages,
		status,
		error,
		isStreaming: status === "streaming" || status === "submitted",
		sendText,
		sendToolAnswer,
		sendApproval,
		runWorkflow,
		stop,
		setMessages,
	};
}

export type UseAgentChatReturn = ReturnType<typeof useAgentChat>;
