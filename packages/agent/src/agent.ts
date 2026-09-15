import {
  smoothStream,
  pruneMessages,
  ToolLoopAgent,
  type LanguageModel,
  type ToolSet,
} from "ai";

import { env } from "@aevryn/env/server";

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

export const streamTransform = [
  smoothStream({ delayInMs: 12, chunking: "word" }),
] as const;

export interface AevrynAgentOptions {
  model: LanguageModel;
  mode: "chat" | "run";
  tools: ToolSet;
  instructions: string;
    budgetUsd?: number;
    toolsContext?: unknown;
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
    // Per-request BYOK context — consumed by tool `execute({ context })`.
    toolsContext: opts.toolsContext as never,
    stopWhen,
    // HMAC-binds approval responses to the server (AI SDK group B-6).
    experimental_toolApprovalSecret: env.VAULT_KEY,
    // Lenient repair of malformed tool arguments (trailing commas, wrapped
    // arrays, cut-off JSON) — gpt-oss-120b emits these occasionally.
    experimental_repairToolCall: repairToolCall as never,
    // Strip reasoning parts and prune stale tool outputs on every step.
    // Groq free-tier is 8k TPM — bloated histories blow the limit.
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

      // Always prune tool outputs from older messages to keep history lean.
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

      // Still over threshold: compact more aggressively.
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
