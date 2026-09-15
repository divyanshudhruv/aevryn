import { convertToModelMessages, validateUIMessages, type UIMessage } from "ai";
import { MemoryClient } from "mem0ai";

import {
  ModelRegistry,
  anakinToolSet,
  askUserTool,
  buildSystemPrompt,
  createAevrynAgent,
  presentPlanTool,
  streamTransform,
  updateStepStatusTool,
  type ToolContext,
} from "@aevryn/agent";
import type { StepToolCall, Workflow } from "@aevryn/db";
import { db, decryptSecret, ids, userKeys, userProviders, userSettings } from "@aevryn/db";
import { eq } from "drizzle-orm";

import { ChatService } from "./chat-service";

export interface AgentRunInput {
  userId: string;
  workspaceId: string;
  threadId: string;
  uiMessages: UIMessage[];
  mode: "chat" | "run";
    modelOverride?: { providerSlug?: string; modelId?: string };
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

    async respond(input: AgentRunInput, init?: ResponseInit): Promise<Response> {
    const { model } = await this.resolveModel(input);
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
    const memoryContext = memoryEnabled
      ? await this.recallMemory(mem0Key, input)
      : undefined;

    const boundWorkflow: Workflow | null =
      input.mode === "run"
        ? await this.chat.boundWorkflow(input.threadId)
        : null;

    // Thread status lifecycle: running while the agent works; onEnd sets the
    // terminal state. Sidebar dots and Run/Stop buttons read this.
    await this.chat
      .setThreadStatus({ threadId: input.threadId, status: "running" })
      .catch(() => undefined);

    const tools = {
      ...anakinToolSet,
      askUser: askUserTool,
      presentPlan: presentPlanTool,
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
      instructions: buildInstructions(input, memoryContext, boundWorkflow),
      toolsContext,
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

    // The SDK's declared `stream()` type omits `toolsContext`/`streamRetries`
    // (they exist at runtime); extend it rather than losing callback types.
    const streamFn = agent.stream.bind(agent) as (
      options: Parameters<typeof agent.stream>[0] & {
        toolsContext?: unknown;
        streamRetries?: number;
      },
    ) => ReturnType<typeof agent.stream>;
    const result = await streamFn({
      messages: await convertToModelMessages(input.uiMessages),
      experimental_transform: [...streamTransform],
      // Per-call context + mid-stream retry (Groq malformed tool-JSON
      // retries the current step, preserving earlier steps/results).
      toolsContext: toolsContext,
      streamRetries: 2,
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
          const usage = event.totalUsage;
          finalUsage = {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
          };

          if (mem0Key && memoryEnabled) {
            const lastUser = lastUserText(input.uiMessages);
            if (lastUser) {
              await storeMemoryTurn(
                mem0Key,
                input.threadId,
                lastUser,
                event.text ?? "",
              );
            }
          }
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
      // Reasoning parts never reach the client/persistence: replaying them
      // would serialize to `reasoning_content`, which Groq (and other
      // OpenAI-compatible providers) reject with a 400.
      sendReasoning: false,
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

          await this.chat.saveMessage({
            userId: input.userId,
            threadId: input.threadId,
            role: "assistant",
            content: text,
            parts: responseMessage?.parts as unknown[] | undefined,
            usage: finalUsage,
            steps: stepSnapshots,
          });

          if (input.mode === "run" && boundWorkflow) {
            await this.chat.setWorkflowStatus({
              workflowId: boundWorkflow.id,
              status: "running",
            });
          }
          // Terminal thread status: awaiting_approval when a client tool is
          // still pending (QuestionFlow / plan card), otherwise idle.
          const hasPendingClientTool = (responseMessage?.parts ?? []).some(
            (p) =>
              typeof p === "object" &&
              p !== null &&
              "state" in p &&
              (p as { state?: string }).state === "input-available" &&
              String((p as { type?: string }).type ?? "").startsWith(
                "tool-askUser",
              ) ||
              (typeof p === "object" &&
                p !== null &&
                "state" in p &&
                (p as { state?: string }).state === "approval-requested"),
          );
          await this.chat.setThreadStatus({
            threadId: input.threadId,
            status: hasPendingClientTool ? "awaiting_approval" : "idle",
          });
        } catch (err) {
          console.error("[agent-service] persist-on-finish failed", err);
        }
      },
    });
  }

  // ─── Resolution helpers ────────────────────────────────────────────────────

  private async resolveModel(
    input: AgentRunInput,
  ): Promise<{ model: ReturnType<typeof ModelRegistry.resolve> }> {
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

    return { model: ModelRegistry.resolve(provider, modelId) };
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

    private async recallMemory(
    mem0Key: string | null,
    input: AgentRunInput,
  ): Promise<string | undefined> {
    if (!mem0Key) return undefined;
    const query = lastUserText(input.uiMessages);
    if (!query) return undefined;

    try {
      const client = new MemoryClient({ apiKey: mem0Key });
      const { results } = await client.search(query, {
        filters: { user_id: input.threadId },
        topK: 5,
      });
      const memories = results
        .map((m) => (typeof m.memory === "string" ? m.memory : undefined))
        .filter((m): m is string => Boolean(m));
      return memories.length > 0
        ? memories.map((m) => `- ${m}`).join("\n")
        : undefined;
    } catch (err) {
      console.warn("[agent-service] mem0 recall failed (continuing)", err);
      return undefined;
    }
  }
}

async function storeMemoryTurn(
  mem0Key: string,
  threadId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  // Mem0 rejects messages with empty/blank content (HTTP 400 'code=blank').
  const user = userText.trim();
  const assistant = assistantText.trim().slice(0, 2_000);
  if (!user || !assistant) return;
  try {
    const client = new MemoryClient({ apiKey: mem0Key });
    await client.add(
      [
        { role: "user", content: user },
        { role: "assistant", content: assistant },
      ],
      { userId: threadId },
    );
  } catch (err) {
    console.warn("[agent-service] mem0 store failed (continuing)", err);
  }
}

function lastUserText(uiMessages: UIMessage[]): string | undefined {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const message = uiMessages[i]!;
    if (message.role !== "user") continue;
    const textParts = message.parts.filter(
      (p): p is { type: "text"; text: string } => p.type === "text",
    );
    const text = textParts
      .map((p) => p.text)
      .join("\n")
      .trim();
    return text || undefined;
  }
  return undefined;
}

function buildInstructions(
  input: AgentRunInput,
  memoryContext?: string,
  boundWorkflow?: Workflow | null,
): string {
  let plan: string | undefined;
  if (input.mode === "run" && boundWorkflow) {
    plan = `${boundWorkflow.objective ? `Objective: ${boundWorkflow.objective}\n` : ""}(Step statuses live in plan_steps — use updateStepStatus.)`;
  }

  return buildSystemPrompt({
    mode: input.mode,
    plan,
    memoryContext,
  });
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
