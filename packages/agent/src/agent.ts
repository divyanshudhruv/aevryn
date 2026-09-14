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
    // Context compaction (AI SDK group A-5): past ~100k estimated tokens,
    // prune tool outputs before the last 3 messages.
    prepareStep: ({ messages }) => {
      const estimated = messages.reduce(
        (sum, message) =>
          sum +
          estimateTokens(
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
          ),
        0,
      );

      if (estimated <= COMPACTION_THRESHOLD_TOKENS) return {};

      return {
        messages: pruneMessages({
          messages,
          toolCalls: "before-last-3-messages",
          emptyMessages: "remove",
        }),
      };
    },
  });
}
