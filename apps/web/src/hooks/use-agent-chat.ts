"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo } from "react";

export type AgentMode = "chat" | "run";

export interface UseAgentChatOptions {
	threadId: string;
	workspaceId: string;
	initialMessages?: UIMessage[];
	mode?: AgentMode;
	model?: { providerSlug?: string; modelId?: string };
		enabled?: boolean;
}

export function useAgentChat({
	threadId,
	workspaceId,
	initialMessages,
	mode = "chat",
	model,
	enabled = true,
}: UseAgentChatOptions) {
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				body: { threadId, workspaceId, mode, model },
			}),
		[threadId, workspaceId, mode, model],
	);

	const chat = useChat({
		transport,
		messages: initialMessages,
	});

	const { sendMessage, addToolResult, addToolApprovalResponse, messages, status, error, stop, setMessages } = chat;

	// Replay: when thread history arrives after mount (async GET), hydrate once.
	useEffect(() => {
		if (!enabled || !initialMessages?.length) return;
		setMessages((current) => (current.length > 0 ? current : initialMessages));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled, initialMessages]);

		const sendText = useCallback(
		(text: string) => {
			sendMessage({ text });
		},
		[sendMessage],
	);

		const sendToolAnswer = useCallback(
		(toolCallId: string, toolName: string, answer: unknown) => {
			addToolResult({
				tool: toolName,
				toolCallId,
				output: answer,
			});
		},
		[addToolResult],
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
		stop,
		setMessages,
	};
}

export type UseAgentChatReturn = ReturnType<typeof useAgentChat>;
