import {
  convertToModelMessages,
  generateText,
  validateUIMessages,
  type UIMessage,
} from "ai";

import {
  ModelRegistry,
  anakinToolSet,
  askUserTool,
  beginTaskTool,
  buildSystemPrompt,
  createAevrynAgent,
  makeRetryAgentTool,
  presentPlanTool,
  streamTransform,
  updateStepStatusTool,
  type ToolContext,
} from "@aevryn/agent";
import type { RunStatus, StepToolCall, Workflow } from "@aevryn/db";
import { db, decryptSecret, ids, threads, userKeys, userProviders, userSettings } from "@aevryn/db";
import { and, eq } from "drizzle-orm";

import { ChatService } from "./chat-service";

// Scoped to chat mode, where the model only needs research/scrape + memory.
// Wire/browser automation stays in run mode (bound workflow execution).
const CHAT_TOOL_NAMES = new Set([
  "searchWeb",
  "scrapeUrl",
  "scrapeBatch",
  "crawlSite",
  "mapSite",
  "researchTopic",
  "aiVisibility",
  "aiVisibilitySources",
  "aiVisibilitySearches",
  "aiVisibilityRetry",
  "storeMemory",
  "searchMemory",
]);

export interface AgentRunInput {
  userId: string;
  workspaceId: string;
  threadId: string;
  uiMessages: UIMessage[];
  mode: "chat" | "run";
    modelOverride?: { providerSlug?: string; modelId?: string };
    /** Reasoning effort (providerOptions) — ignored by non-reasoning models. */
    thinkingEffort?: string;
}

export interface AgentRunServices {
  chat: ChatService;
}

export class AgentService {
  private readonly chat: ChatService;

  constructor(
    services?: Partial<AgentRunServices>,
    private readonly client = db,
  ) {
    this.chat = services?.chat ?? new ChatService(this.client);
  }

    async respond(
      input: AgentRunInput,
      init?: ResponseInit & { signal?: AbortSignal },
    ): Promise<Response> {
    const { model, providerSlug } = await this.resolveModel(input);
    const [{ anakinKey, mem0Key }, settingsRows] = await Promise.all([
      this.resolveKeys(input.userId),
      this.client
        .select({ settings: userSettings.settings })
        .from(userSettings)
        .where(eq(userSettings.userId, input.userId))
        .limit(1),
    ]);
    // Memory switch: null means "on when a key exists" (legacy behavior).
    const memoryEnabled =
      (settingsRows[0]?.settings.memoryEnabled ?? null) !== false;

    // Thread status writes are serialized and deduped: mid-run tool failures
    // flip "running" → "retrying" → "running" via the stream callbacks without
    // spamming the DB/realtime channel, and the fire-and-forget writes can't
    // land out of order (the terminal onEnd awaits the tail of the queue).
    let lastSetStatus: RunStatus | null = null;
    let statusQueue: Promise<void> = Promise.resolve();
    const setStatus = (status: RunStatus): Promise<void> => {
      if (status === lastSetStatus) return statusQueue;
      lastSetStatus = status;
      statusQueue = statusQueue.then(() =>
        this.chat
          .setThreadStatus({ threadId: input.threadId, status })
          .catch(() => undefined),
      );
      return statusQueue;
    };

    await setStatus("running");

    const boundWorkflow: Workflow | null =
      input.mode === "run"
        ? await this.chat.boundWorkflow(input.threadId)
        : null;

    // A thread left in `failed` tells the agent the previous turn died
    // mid-run: retryAgent repairs the missed step instead of restarting.
    const [threadRow] = await this.client
      .select({ status: threads.status })
      .from(threads)
      .where(eq(threads.id, input.threadId))
      .limit(1);
    const threadFailed = threadRow?.status === "failed";

    // Thread status lifecycle: running while the agent works; onEnd sets the
    // terminal state. Sidebar dots and Run/Stop buttons read this. A re-run
    // of a failed thread starts as `retrying` — the agent is in repair mode,
    // not starting a fresh run.
    await setStatus(threadFailed ? "retrying" : "running");

    // Tool set is mode-scoped. Plain chat carries only the research/scrape/
    // memory core — every tool body ships its full parameter schema in the
    // prompt, and wire/browser automation schemas alone eat thousands of
    // input tokens per turn ("Hi" was burning ~5k worth mostly on tool JSON).
    // Run mode gets the complete set, since executing a bound workflow
    // legitimately needs site automation.
    const toolNames =
      input.mode === "run"
        ? Object.keys(anakinToolSet)
        : Object.keys(anakinToolSet).filter((name) =>
            CHAT_TOOL_NAMES.has(name),
          );

    const tools = {
      ...Object.fromEntries(
        toolNames.map((name) => [name, anakinToolSet[name as keyof typeof anakinToolSet]]),
      ),
      askUser: askUserTool,
      presentPlan: presentPlanTool,
      beginTask: beginTaskTool,
      retryAgent: makeRetryAgentTool({ model }),
      ...(input.mode === "run" && boundWorkflow
        ? { updateStepStatus: updateStepStatusTool }
        : {}),
    } as const;

    // toolsContext is a per-tool map (AI SDK v5): each tool name maps to its own
    // context object, validated against the tool's contextSchema before execution.
    const context: ToolContext = {
      userId: input.userId,
      threadId: input.threadId,
      workspaceId: input.workspaceId,
      anakinKey,
      mem0Key: memoryEnabled ? mem0Key : null,
      ...(input.mode === "run" && boundWorkflow
        ? { workflowId: boundWorkflow.id }
        : {}),
    };
    const toolsContext = Object.fromEntries(
      Object.keys(tools).map((k) => [k, context]),
    );

    const agent = createAevrynAgent({
      model,
      mode: input.mode,
      tools: tools as never,
      instructions: buildInstructions(input, boundWorkflow, threadFailed),
      toolsContext,
      thinkingEffort: input.thinkingEffort,
      providerOptionsKey: providerSlug,
    });

    // Lifecycle accumulators (AI SDK group A-3 callbacks feed these).
    const toolExecutions = new Map<
      string,
      { toolName: string; input: unknown; startedAt: string }
    >();
    const toolResults = new Map<
      string,
      { status: "running" | "completed" | "failed"; output?: unknown }
    >();
    const stepSnapshots: Array<{
      position: number;
      text: string;
      toolCalls: StepToolCall[];
    }> = [];
    // Filled by the agent-level onEnd; consumed by the UIMessage-stream
    // onEnd below (which fires later and owns final persistence).
    let finalUsage: { inputTokens: number; outputTokens: number; totalTokens: number } = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    // Filled by the agent-level onEnd (which has finishReason); consumed by
    // the UIMessage-stream onEnd to flip the thread to `failed`/`idle`.
    let streamFailed = false;
    let streamAborted = false;

    // The SDK's declared `stream()` type omits `toolsContext`/`streamRetries`
    // (they exist at runtime); extend it rather than losing callback types.
    const streamFn = agent.stream.bind(agent) as (
      options: Parameters<typeof agent.stream>[0] & {
        toolsContext?: unknown;
        streamRetries?: number;
      },
    ) => ReturnType<typeof agent.stream>;
    const result = await streamFn({
      messages: await convertToModelMessages(pruneModelHistory(input.uiMessages)),
      experimental_transform: [...streamTransform],
      // Per-call context + mid-stream retry (Groq malformed tool-JSON
      // retries the current step, preserving earlier steps/results).
      toolsContext: toolsContext,
      streamRetries: 2,
      // Client disconnect / composer Stop / sidebar Stop abort the HTTP
      // request; forwarding the signal cancels the model call and in-flight
      // tools instead of letting the loop run to completion invisibly.
      abortSignal: init?.signal,
      onToolExecutionStart: (event) => {
        if (event.toolCall?.toolName === "retryAgent") {
          void setStatus("retrying");
        }
      },

      onToolExecutionEnd: (event) => {
        const call = event.toolCall as {
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
        };
        if (!call?.toolCallId) return;
        toolExecutions.set(call.toolCallId, {
          toolName: call.toolName ?? "unknown",
          input: call.input,
          startedAt: new Date().toISOString(),
        });
        const output = event.toolOutput as
          | { type: "tool-result"; output: unknown }
          | { type: "tool-error"; error: unknown }
          | undefined;
        toolResults.set(call.toolCallId, {
          status: output?.type === "tool-error" ? "failed" : "completed",
          output:
            output?.type === "tool-error"
              ? { error: String(output.error) }
              : output?.output,
        });
        // Status drives the sidebar dot: a failed tool call flips the thread
        // to `retrying` (the agent is recovering); the next successful call
        // flips it back to `running`. streamRetries (malformed tool JSON) and
        // the retryAgent sub-agent both route through this.
        if (output?.type === "tool-error") {
          void setStatus("retrying");
        } else if (lastSetStatus === "retrying") {
          void setStatus("running");
        }
      },

      onStepEnd: (event) => {
        const calls: StepToolCall[] = [];
        for (const toolCall of event.toolCalls as Array<{
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
        }>) {
          if (!toolCall?.toolCallId) continue;
          const started = toolExecutions.get(toolCall.toolCallId);
          const finished = toolResults.get(toolCall.toolCallId);
          calls.push({
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName ?? "unknown",
            input: toolCall.input,
            status: finished?.status ?? "running",
            ...(finished ? { output: finished.output } : {}),
            startedAt: started?.startedAt ?? new Date().toISOString(),
          });
        }
        stepSnapshots.push({
          position: event.stepNumber,
          text: event.text ?? "",
          toolCalls: calls,
        });
      },

      onEnd: async (event) => {
        try {
          if (event.finishReason === "error") {
            streamFailed = true;
          }
          // The user stopped the turn (composer Stop, sidebar Stop, tab
          // close): persist what streamed so far, but mark it aborted so the
          // terminal persistence below resets the thread instead of
          // flagging it failed. AI SDK v7 has no dedicated abort finish
          // reason — an aborted stream reports `other` (or `error` when the
          // provider throws on the dead request), so `abortSignal` presence
          // + non-stop reasons is the discriminator.
          if (
            init?.signal != null &&
            (event.finishReason === "other" || event.finishReason === "error")
          ) {
            streamAborted = true;
          }
          const usage = event.totalUsage;
          finalUsage = {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
          };
        } catch (err) {
          console.error("[agent-service] on-finish hooks failed", err);
        }
      },
    });

    return result.toUIMessageStreamResponse({
      ...init,
      // Token usage rides to the client on the message metadata. Read from
      // the finish part directly (part.totalUsage) — the agent-level onEnd
      // that fills finalUsage fires after this stream part, so reading the
      // variable here would race and often emit zeros.
      messageMetadata: ({ part }) => {
        if (part.type !== "finish") return undefined;
        const usage = part.totalUsage;
        const inputTokens = usage?.inputTokens ?? finalUsage.inputTokens;
        const outputTokens = usage?.outputTokens ?? finalUsage.outputTokens;
        return {
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
          createdAt: new Date().toISOString(),
        };
      },
      originalMessages: input.uiMessages,
      generateMessageId: () => ids.message(),
      // Reasoning parts stream LIVE to the client (the timeline renders them
      // as step descriptions inside the thinking card). They are stripped
      // from persistence below: replaying them would serialize to
      // `reasoning_content`, which Groq (and other OpenAI-compatible
      // providers) reject with a 400.
      sendReasoning: true,
      // The UIMessage-stream end event carries the FULL message list —
      // including every tool part, client-tool answer (askUser answers,
      // plan decisions), and approval response. Persisting here is what
      // makes the whole timeline (not just text) survive refresh.
      onEnd: async ({ responseMessage }) => {
        try {
          const text = responseMessage
            ? responseMessage.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p) => p.text)
                .join("\n")
            : "";

          // Failure/abort digest: summarize the tool calls that DID complete
          // as a text part, so the next turn's model (which only sees text
          // parts of older messages after pruneModelHistory) knows what work
          // actually happened — instead of confidently reporting "nothing".
          const digest =
            streamFailed || streamAborted
              ? buildFailureDigest(toolExecutions, toolResults)
              : null;
          // Reasoning streamed to the client live but is never persisted
          // (providers reject `reasoning_content` on replay).
          const persistedParts = (responseMessage?.parts ?? []).filter(
            (p) => {
              const type = (p as { type?: string }).type;
              return type !== "reasoning" && type !== "reasoning-file";
            },
          );
          const partsWithDigest =
            digest && responseMessage
              ? [...persistedParts, { type: "text" as const, text: `\n\n${digest}` }]
              : persistedParts;

          await this.chat.saveMessage({
            userId: input.userId,
            threadId: input.threadId,
            role: "assistant",
            content: digest ? `${text}\n\n${digest}` : text,
            parts: partsWithDigest,
            usage: finalUsage,
            steps: stepSnapshots,
          });

          if (input.mode === "run" && boundWorkflow) {
            await this.chat.setWorkflowStatus({
              workflowId: boundWorkflow.id,
              status: "running",
            });
          }

          // A provider/model error killed the stream (retries exhausted):
          // persist a thread-internal error tile and mark the thread failed
          // so a re-run triggers the retryAgent repair path.
          if (streamFailed) {
            await this.chat.saveMessage({
              userId: input.userId,
              threadId: input.threadId,
              role: "system",
              content: FAILED_TURN_TEXT,
              parts: [
                { type: "system-message", variant: "error", text: FAILED_TURN_TEXT },
              ],
            });
            await setStatus("failed");
            return;
          }

          // The user stopped the turn: partial content was persisted above;
          // settle the thread to idle (NOT awaiting_approval — the pending
          // cards are dead now) so the sidebar/header leave run state.
          if (streamAborted) {
            await setStatus("idle");
            return;
          }

          // Terminal thread status: awaiting_approval when a client tool is
          // still pending (QuestionFlow / plan card / native approval),
          // otherwise idle. presentPlan and askUser halt the stream with
          // state "input-available"; native approvals (wireAction etc.) use
          // "approval-requested". Why the thread stays "running" while the
          // plan card sits on screen if this misses any of those.
          const hasPendingClientTool = (responseMessage?.parts ?? []).some(
            (p) => {
              if (typeof p !== "object" || p === null || !("state" in p))
                return false;
              const type = String((p as { type?: string }).type ?? "");
              const state = (p as { state?: string }).state;
              if (!type.startsWith("tool-")) return false;
              if (state === "output-available" || state === "output-error")
                return false;
              return (
                type.startsWith("tool-askUser") ||
                type.startsWith("tool-presentPlan") ||
                state === "approval-requested"
              );
            },
          );
          await setStatus(hasPendingClientTool ? "awaiting_approval" : "idle");
        } catch (err) {
          console.error("[agent-service] persist-on-finish failed", err);
        }
      },
    });
  }

  // ─── Auto title ───────────────────────────────────────────────────────

  /** Titles that mean "the user never named this thread" — safe to
   *  auto-replace with a generated summary title. */
  private static readonly DEFAULT_TITLES = new Set([
    "",
    "new thread",
    "untitled",
  ]);

  /** After the first real user message, generate a short ChatGPT-style
   *  title (3–6 words) from it and update the thread row. Fire-and-forget:
   *  the postgres_changes realtime channel pushes the new title to the
   *  header thread-switcher and the sidebar automatically. Never overwrites
   *  a user-set title or an already-generated one. */
  async autoTitle(input: {
    threadId: string;
    userId: string;
    message: string;
  }): Promise<void> {
    try {
      const [threadRow] = await this.client
        .select({ title: threads.title })
        .from(threads)
        .where(
          and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
        )
        .limit(1);
      if (!threadRow) return;
      if (!AgentService.DEFAULT_TITLES.has(threadRow.title.trim().toLowerCase()))
        return;

      const { model } = await this.resolveModel({
        userId: input.userId,
      } as AgentRunInput);
      const { text } = await generateText({
        model,
        maxOutputTokens: 40,
        prompt:
          `Generate a concise title (3-6 words, no quotes, no trailing period) ` +
          `summarizing what the user wants in this conversation. Reply with ` +
          `ONLY the title text and nothing else.\n\nUser message: ${input.message.slice(0, 500)}`,
      });
      const title = text.trim().replace(/^["'“”]+|["'“”.]+$/g, "").slice(0, 80);
      if (!title) return;

      await this.client
        .update(threads)
        .set({ title })
        .where(
          and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
        );
    } catch {
      // Title generation is cosmetic — provider errors, missing models, or
      // race conditions must never break the chat turn.
    }
  }

  // ─── Resolution helpers ────────────────────────────────────────────────────

  private async resolveModel(
    input: AgentRunInput,
  ): Promise<{ model: ReturnType<typeof ModelRegistry.resolve>; providerSlug: string }> {
    const [providers, settingsRows] = await Promise.all([
      this.client
        .select()
        .from(userProviders)
        .where(eq(userProviders.userId, input.userId)),
      this.client
        .select({ settings: userSettings.settings })
        .from(userSettings)
        .where(eq(userSettings.userId, input.userId))
        .limit(1),
    ]);

    if (providers.length === 0) {
      throw Object.assign(
        new Error(
          "No model provider configured. Add one in Settings → Models.",
        ),
        { code: "NO_PROVIDER" },
      );
    }

    const savedDefault = settingsRows[0]?.settings.defaultModel ?? null;

    // Precedence: per-request override → saved default → first provider.
    const override = input.modelOverride?.providerSlug
      ? input.modelOverride
      : savedDefault;

    const provider =
      (override?.providerSlug
        ? providers.find((p) => p.slug === override.providerSlug)
        : undefined) ?? providers[0]!;

    const modelId = override?.modelId ?? provider.models[0]?.id ?? "";
    if (!modelId) {
      throw Object.assign(
        new Error(`Provider '${provider.slug}' has no models configured.`),
        { code: "NO_MODEL" },
      );
    }

    return {
      model: ModelRegistry.resolve(provider, modelId),
      providerSlug: provider.slug,
    };
  }

  private async resolveKeys(userId: string): Promise<{
    anakinKey: string | null;
    mem0Key: string | null;
  }> {
    const keys = await this.client
      .select()
      .from(userKeys)
      .where(eq(userKeys.userId, userId));

    const find = (name: string): string | null => {
      const row = keys.find((k) => k.name === name);
      if (!row) return null;
      try {
        return decryptSecret(row.encryptedValue);
      } catch {
        return null;
      }
    };

    return { anakinKey: find("anakin"), mem0Key: find("mem0") };
  }
}

const FAILED_TURN_TEXT =
  "The generation failed mid-run and this turn was cut off. Re-run the thread or reply \"continue\" to pick back up.";

// ─── Failure digest ───────────────────────────────────────────────────────────
// When a turn dies mid-loop (provider credits, abort, error), the model's
// only knowledge of its tool calls lived in that turn's tool parts — which
// pruneModelHistory strips before the next request. Persisting a compact
// digest as a *text* part on the assistant message keeps the breadcrumbs
// model-visible: text parts survive history pruning, tool parts don't.

// Per-tool output budget in the digest (chars). Big scrapes are truncated;
// the goal is "enough to answer about it", not a full replay.
const DIGEST_TOOL_OUTPUT_CHARS = 600;
// Total digest ceiling so a 30-tool run can't blow Groq's 8k TPM on its own.
const DIGEST_MAX_CHARS = 4000;

function buildFailureDigest(
  toolExecutions: Map<string, { toolName: string; input: unknown; startedAt: string }>,
  toolResults: Map<string, { status: "running" | "completed" | "failed"; output?: unknown }>,
): string | null {
  if (toolExecutions.size === 0) return null;

  const lines: string[] = [];
  let total = 0;

  for (const [callId, exec] of toolExecutions) {
    const result = toolResults.get(callId);
    const status = result?.status ?? "running";
    const mark = status === "completed" ? "✓" : status === "failed" ? "✗" : "…";
    const inputStr = JSON.stringify(exec.input ?? null);
    const inputPreview =
      inputStr.length > 150 ? `${inputStr.slice(0, 150)}…` : inputStr;

    let outputPreview = "";
    if (result?.output != null) {
      const outputStr =
        typeof result.output === "string"
          ? result.output
          : JSON.stringify(result.output);
      outputPreview =
        outputStr.length > DIGEST_TOOL_OUTPUT_CHARS
          ? `${outputStr.slice(0, DIGEST_TOOL_OUTPUT_CHARS)}… [truncated]`
          : outputStr;
    }

    const line =
      `- ${mark} ${exec.toolName}(${inputPreview})${
        outputPreview ? ` → ${outputPreview}` : status === "running" ? " → (never finished)" : " → (no output)"
      }`;

    // Respect the total ceiling: stop adding lines rather than emitting a
    // half-truncated blob.
    if (total + line.length > DIGEST_MAX_CHARS) {
      lines.push(`- … (${toolExecutions.size - lines.length} more tool calls omitted)`);
      break;
    }
    lines.push(line);
    total += line.length;
  }

  return [
    "[Work completed before this turn was cut off — these tool results are real and can be cited, but they were NOT included in the conversation.]",
    ...lines,
  ].join("\n");
}

// Model-history budget. Only the last few messages travel to the model, and
// each one is reduced to the agent's finished text (the summary/message it
// actually produced) — tool calls and their outputs are dropped so giant
// replay payloads (scrapes, tables, screenshots) don't re-enter the prompt
// every turn. The final message is kept whole: on a resume it carries the
// paired client-tool call+answer (askUser, presentPlan, approvals) that the
// SDK needs to continue.
const MODEL_HISTORY_WINDOW = 8;

function pruneModelHistory(uiMessages: UIMessage[]): UIMessage[] {
  const tail = uiMessages.slice(-MODEL_HISTORY_WINDOW);
  return tail.map((message, i) => {
    if (i === tail.length - 1) {
      return message;
    }
    const { parts, ...rest } = message;
    return {
      ...rest,
      parts: parts.filter((p) => (p as { type?: string }).type === "text"),
    } as UIMessage;
  });
}

function buildInstructions(
  input: AgentRunInput,
  boundWorkflow?: Workflow | null,
  retryAfterFailure = false,
): string {
  let plan: string | undefined;
  if (input.mode === "run" && boundWorkflow) {
    plan = `${boundWorkflow.objective ? `Objective: ${boundWorkflow.objective}\n` : ""}(Step statuses live in plan_steps — use updateStepStatus.)`;
  }

  const failureGuidance = retryAfterFailure
    ? `

## Recovering from a failed run
A previous turn failed mid-stream. Do NOT restart earlier steps: re-run only the failed step with retryAgent (describe the step and the error), then continue the plan from where it stopped.`
    : "";

  const prompt = buildSystemPrompt({
    mode: input.mode,
    plan,
  });
  // Task-affinity card headers: the model titles each subtask; the timeline
  // groups the calls between beginTask calls under that label.
  const taskGuidance =
    `\n\n## Step cards\n` +
    `When you move to a DISTINCT subtask, call beginTask(label) first — a short imperative label like "Searching flights". ` +
    `Group the tool calls of the SAME task together between beginTask calls. ` +
    `If the user explicitly ordered steps ("first X, then Y"), emit one beginTask per ordered step, in order.`;
  return failureGuidance ? prompt + failureGuidance : prompt + taskGuidance;
}

export async function loadThreadMessages(
  threadId: string,
  userId: string,
): Promise<UIMessage[]> {
  const chatService = new ChatService(db);
  const { messages: messageRows } = await chatService.loadThread({
    threadId,
    userId,
  });

  const uiMessages = messageRows.map((row) => ({
    id: row.id,
    role: row.role,
    ...(row.usage != null || row.createdAt != null
      ? {
          metadata: {
            ...(row.usage != null ? { usage: row.usage } : {}),
            ...(row.createdAt != null
              ? { createdAt: row.createdAt.toISOString() }
              : {}),
          },
        }
      : {}),
    // Persisted parts restore tool cards, QuestionFlow answers, plan
    // decisions, and approvals exactly; legacy rows fall back to text.
    // Reasoning parts are stripped: providers like Groq reject
    // `reasoning_content` on replayed assistant messages.
    parts: (Array.isArray(row.parts) && row.parts.length > 0
      ? row.parts
      : [{ type: "text" as const, text: row.content }]
    ).filter(
      (p) =>
        (p as { type?: string }).type !== "reasoning" &&
        (p as { type?: string }).type !== "reasoning-file",
    ),
  }));

  try {
    return await validateUIMessages({ messages: uiMessages });
  } catch {
    return uiMessages as UIMessage[];
  }
}
