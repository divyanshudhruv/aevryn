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

// Ceiling on completion tokens per step. Gpt-oss-2xb happily rambles many
// thousands of tokens on a one-line greeting, blowing Groq's free 8k TPM / 200k
// TPD buckets — cap output so a turn can't eat the allowance. Run-mode steps
// legitimately need more room (long extracted reports), so they get a bigger
// cap; plain chat is capped tighter.
export const CHAT_MAX_OUTPUT_TOKENS = 1024;
export const RUN_MAX_OUTPUT_TOKENS = 8192;

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
    maxOutputTokens?: number;
    /** Reasoning effort (providerOptions) — models without reasoning ignore it. */
    thinkingEffort?: string;
    /** Provider options key — the `name` the openai-compatible client was
     *  created with (the provider slug). Required with thinkingEffort. */
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
    // Per-request BYOK context — consumed by tool `execute({ context })`.
    toolsContext: opts.toolsContext as never,
    stopWhen,
    // HMAC-binds approval responses to the server (AI SDK group B-6).
    experimental_toolApprovalSecret: env.VAULT_KEY,
    // Lenient repair of malformed tool arguments (trailing commas, wrapped
    // arrays, cut-off JSON) — gpt-oss-120b emits these occasionally.
    experimental_repairToolCall: repairToolCall as never,
    ...(opts.thinkingEffort && opts.providerOptionsKey
      ? {
          providerOptions: {
            // OpenAI-compatible `reasoningEffort`; unsupported models and
            // providers silently ignore it (the non-reasoning fallback).
            [opts.providerOptionsKey]: { reasoningEffort: opts.thinkingEffort },
          },
        }
      : {}),
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
