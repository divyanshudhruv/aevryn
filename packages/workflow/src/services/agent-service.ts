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
import { db, decryptSecret, userKeys, userProviders } from "@aevryn/db";
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
    const { anakinKey, mem0Key } = await this.resolveKeys(input.userId);
    const memoryContext = await this.recallMemory(mem0Key, input);

    const boundWorkflow: Workflow | null =
      input.mode === "run"
        ? await this.chat.boundWorkflow(input.threadId)
        : null;

    const tools = {
      ...anakinToolSet,
      askUser: askUserTool,
      presentPlan: presentPlanTool,
      ...(input.mode === "run" && boundWorkflow
        ? { updateStepStatus: updateStepStatusTool }
        : {}),
    } as const;

    const toolsContext: ToolContext = {
      userId: input.userId,
      threadId: input.threadId,
      workspaceId: input.workspaceId,
      anakinKey,
      mem0Key,
      ...(input.mode === "run" && boundWorkflow
        ? { workflowId: boundWorkflow.id }
        : {}),
    };

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

    const result = await agent.stream({
      messages: await convertToModelMessages(input.uiMessages),
      experimental_transform: [...streamTransform],

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
          await this.chat.saveMessage({
            userId: input.userId,
            threadId: input.threadId,
            role: "assistant",
            content: event.text ?? "",
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            },
            steps: stepSnapshots,
          });

          if (input.mode === "run" && boundWorkflow) {
            await this.chat.setWorkflowStatus({
              workflowId: boundWorkflow.id,
              status: "running",
            });
          }

          if (mem0Key) {
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
          console.error("[agent-service] persist-on-finish failed", err);
        }
      },
    });

    return result.toUIMessageStreamResponse(init);
  }

  // ─── Resolution helpers ────────────────────────────────────────────────────

  private async resolveModel(
    input: AgentRunInput,
  ): Promise<{ model: ReturnType<typeof ModelRegistry.resolve> }> {
    const providers = await this.client
      .select()
      .from(userProviders)
      .where(eq(userProviders.userId, input.userId));

    if (providers.length === 0) {
      throw Object.assign(
        new Error(
          "No model provider configured. Add one in Settings → Models.",
        ),
        { code: "NO_PROVIDER" },
      );
    }

    const provider =
      (input.modelOverride?.providerSlug
        ? providers.find((p) => p.slug === input.modelOverride?.providerSlug)
        : undefined) ?? providers[0]!;

    const modelId =
      input.modelOverride?.modelId ?? provider.models[0]?.id ?? "";
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
  try {
    const client = new MemoryClient({ apiKey: mem0Key });
    await client.add(
      [
        { role: "user", content: userText },
        { role: "assistant", content: assistantText.slice(0, 2_000) },
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
    parts: [{ type: "text" as const, text: row.content }],
  }));

  try {
    return await validateUIMessages({ messages: uiMessages });
  } catch {
    return uiMessages as UIMessage[];
  }
}
