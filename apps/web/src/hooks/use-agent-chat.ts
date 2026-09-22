"use client";

import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithApprovalResponses,
	type UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo } from "react";

export type AgentMode = "chat" | "run";

const FAILED_TURN_GENERIC =
	'Something went wrong while streaming this turn. Re-run or reply "continue" to pick back up.';

export interface UseAgentChatOptions {
	threadId: string;
	workspaceId: string;
	initialMessages?: UIMessage[];
	mode?: AgentMode;
	model?: { providerSlug?: string; modelId?: string };
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
		sendAutomaticallyWhen: ({ messages: current }) => {
			if (
				lastAssistantMessageIsCompleteWithApprovalResponses({
					messages: current,
				})
			) {
				return true;
			}
			const last = current[current.length - 1];
			if (last?.role !== "assistant") return false;
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
			const e = err as {
				message?: unknown;
				data?: { error?: { message?: string } };
				cause?: unknown;
			};
			let text = "";
			const apiMessage = e.data?.error?.message;
			if (typeof apiMessage === "string" && apiMessage.trim().length > 0) {
				text = apiMessage.trim();
			}
			if (!text && typeof e.message === "string") {
				const msg = e.message.trim();
				if (msg.length > 0 && msg !== "An error occurred.") text = msg;
			}
			if (
				!text &&
				e.cause instanceof Error &&
				e.cause.message.trim() !== "An error occurred."
			) {
				text = e.cause.message.trim();
			}
			const final = text || FAILED_TURN_GENERIC;
			setMessages((current) => {
				if (
					current.some(
						(m) =>
							m.role === "system" &&
							m.parts.some(
								(p) =>
									(p as { type?: string }).type === "system-message" &&
									(p as { text?: string }).text === final,
							),
					)
				) {
					return current;
				}
				return [
					...current,
					{
						id: `sys-error-${Date.now()}`,
						role: "system",
						parts: [
							{
								type: "system-message",
								variant: "error",
								text: final,
							},
						] as unknown as UIMessage["parts"],
					} as UIMessage,
				];
			});
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
