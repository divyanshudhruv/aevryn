"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useRef } from "react";

import { queryClient } from "@/utils/trpc";

/**
 * Live, streaming chat for one workflow thread. The durable transcript lives
 * in the `agent.getThread` query (message-store); this hook owns the in-flight
 * stream only. On settle (ready/error) the thread is invalidated so the new
 * turn persists and re-renders from the store.
 */
export function useStreamingChat(workflowId: string) {
	const chat = useChat({
		transport: new DefaultChatTransport({
			api: "/api/chat",
			body: { workflowId },
		}),
	});

	const settledRef = useRef(false);
	useEffect(() => {
		if (chat.status === "submitted" || chat.status === "streaming") {
			settledRef.current = false;
			return;
		}
		if (settledRef.current) {
			return;
		}
		settledRef.current = true;
		queryClient.invalidateQueries({ queryKey: [["agent.getThread"]] });
		queryClient.invalidateQueries({ queryKey: [["agent.listRuns"]] });
	}, [chat.status]);

	const resubmitAnswers = useCallback(
		(answers: Record<string, unknown>) => {
			const payload = Object.entries(answers)
				.map(([key, value]) => {
					const q = value as {
						selectedIds?: string[];
						otherText?: string;
						text?: string;
					};
					const parts: string[] = [];
					if (q.selectedIds && q.selectedIds.length > 0) {
						parts.push(q.selectedIds.join(", "));
					}
					if (q.otherText && q.otherText.trim() !== "") {
						parts.push(q.otherText.trim());
					}
					if (q.text && q.text.trim() !== "") {
						parts.push(q.text.trim());
					}
					const content = parts.length > 0 ? parts.join(" — ") : "No answer";
					return `${key}: ${content}`;
				})
				.join("\n");
			void chat.sendMessage({ text: payload });
		},
		[chat],
	);

	return { chat, resubmitAnswers };
}