import { env } from "@aevryn/env/server";
import {
	type LanguageModel,
	pruneMessages,
	smoothStream,
	ToolLoopAgent,
	type ToolSet,
} from "ai";

import {
	COMPACTION_THRESHOLD_TOKENS,
	costGuardStop,
	estimateTokens,
	loopGuardrails,
} from "./loop-control";
import { repairToolCall } from "./tool-call-repair";

export { costGuardStop };

export const AGENT_ID = "aevryn-agent";

export const CHAT_BUDGET_USD = 0.5;
export const RUN_BUDGET_USD = 1;

export const CHAT_MAX_OUTPUT_TOKENS = 1024;
export const RUN_MAX_OUTPUT_TOKENS = 8192;

export const STREAM_RETRIES = 0;

export interface StreamRetryFlags {
	providerRetries: number;
}

export function createStreamRetryFlags(): StreamRetryFlags {
	return { providerRetries: 0 };
}

export const streamTransform = [
	smoothStream({ delayInMs: 40, chunking: "word" }),
] as const;

export interface AevrynAgentOptions {
	model: LanguageModel;
	mode: "chat" | "run";
	tools: ToolSet;
	instructions: string;
	budgetUsd?: number;
	toolsContext?: unknown;
	maxOutputTokens?: number;
	thinkingEffort?: string;
	providerOptionsKey?: string;
}

export function createAevrynAgent(opts: AevrynAgentOptions) {
	const budgetUsd =
		opts.budgetUsd ?? (opts.mode === "run" ? RUN_BUDGET_USD : CHAT_BUDGET_USD);
	const { stopWhen } = loopGuardrails(budgetUsd);

	return new ToolLoopAgent({
		id: AGENT_ID,
		model: opts.model,
		tools: opts.tools,
		instructions: opts.instructions,
		maxOutputTokens:
			opts.maxOutputTokens ??
			(opts.mode === "run" ? RUN_MAX_OUTPUT_TOKENS : CHAT_MAX_OUTPUT_TOKENS),
		toolsContext: opts.toolsContext as never,
		stopWhen,
		experimental_toolApprovalSecret: env.APPROVAL_SECRET,
		experimental_repairToolCall: repairToolCall as never,
		...(opts.thinkingEffort && opts.providerOptionsKey
			? {
					providerOptions: {
						[opts.providerOptionsKey]: { reasoningEffort: opts.thinkingEffort },
					},
				}
			: {}),
		prepareStep: ({ messages }) => {
			const cleaned = messages.map((m) => {
				if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
				const filtered = m.content.filter(
					(p: { type?: string }) => p.type !== "reasoning",
				);
				return filtered.length === m.content.length
					? m
					: { ...m, content: filtered };
			});

			const pruned = pruneMessages({
				messages: cleaned,
				toolCalls: "before-last-2-messages",
				emptyMessages: "remove",
			});

			const estimated = pruned.reduce(
				(sum, message) =>
					sum +
					estimateTokens(
						typeof message.content === "string"
							? message.content
							: JSON.stringify(message.content),
					),
				0,
			);

			if (estimated <= COMPACTION_THRESHOLD_TOKENS) {
				return { messages: pruned };
			}

			return {
				messages: pruneMessages({
					messages: pruned,
					toolCalls: "before-last-1-messages",
					emptyMessages: "remove",
				}),
			};
		},
	});
}
