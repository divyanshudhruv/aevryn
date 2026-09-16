import { isStepCount, tool, ToolLoopAgent, type LanguageModel } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import { mapSiteTool } from "./map-site";
import { scrapeUrlTool } from "./scrape-url";
import { searchWebTool } from "./search-web";

const SUB_AGENT_TOOLS = {
  searchWeb: searchWebTool,
  scrapeUrl: scrapeUrlTool,
  mapSite: mapSiteTool,
} as const;

const SUB_AGENT_INSTRUCTIONS = `You are a focused repair sub-agent. Your job is to fix ONE failed step of a larger run and return only the missing result.

- Investigate with search, scrape, or map as needed. Do not redo work the parent already completed: only produce the specific output the failed step was supposed to deliver.
- Do not call user-interaction, approval, plan, memory, or workflow tools. Work autonomously and return a concise result.
- If you cannot recover, say so plainly and describe the blocker in your final text.`;

function buildRetryPrompt(input: {
  failedStepDescription: string;
  error: string;
  planStep?: string;
  retryTarget?: string;
}): string {
  return `A run failed at one step. Repair it and produce the missing result.

Failed step: ${input.failedStepDescription}
${input.planStep ? `Plan step: ${input.planStep}\n` : ""}Error: ${input.error}
${input.retryTarget ? `Repair target: ${input.retryTarget}` : "Repair target: fix the error and deliver the result the step was meant to produce."}

Return the corrected result as your final text.`;
}

function uniqueToolNames(steps: Array<{ toolCalls?: Array<{ toolName: string }> }>): string[] {
  const names: string[] = [];
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName && !names.includes(call.toolName)) names.push(call.toolName);
    }
  }
  return names;
}

export function makeRetryAgentTool(opts: { model: LanguageModel }) {
  return tool({
    description:
      "Spawn a sub-agent to repair a step that failed mid-run. Give it the failing step's description and the error; it investigates with search/scrape/map and returns the corrected result while the main run continues.",
    inputSchema: z.object({
      failedStepDescription: z
        .string()
        .describe("What the failed step was trying to do, in one or two sentences."),
      error: z.string().describe("The error message or failure reason from the step."),
      planStep: z
        .string()
        .optional()
        .describe("Optional label of the plan step this failure belongs to."),
      retryTarget: z
        .string()
        .optional()
        .describe("Optional: the specific output the step was meant to deliver."),
    }),
    contextSchema: toolContextSchema,
    execute: async (
      input,
      { context, abortSignal }: { context: ToolContext; abortSignal?: AbortSignal },
    ): Promise<
      | { ok: true; resultText: string; subSteps: string[] }
      | { ok: false; error: { code: string; message: string } }
    > => {
      if (!context.anakinKey) {
        return {
          ok: false,
          error: {
            code: "ANAKIN_KEY_REQUIRED",
            message:
              "The repair sub-agent needs an Anakin API key to investigate. Add one in Settings → BYOK.",
          },
        };
      }

      const subAgent = new ToolLoopAgent({
        id: "aevryn-retry-agent",
        model: opts.model,
        instructions: SUB_AGENT_INSTRUCTIONS,
        tools: SUB_AGENT_TOOLS,
        toolsContext: Object.fromEntries(
          Object.keys(SUB_AGENT_TOOLS).map((name) => [name, context]),
        ) as never,
        stopWhen: isStepCount(8),
      });

      try {
        const result = await subAgent.generate({
          prompt: buildRetryPrompt(input),
          abortSignal,
        });
        return {
          ok: true,
          resultText: result.text,
          subSteps: uniqueToolNames(
            (result.steps ?? []) as Array<{
              toolCalls?: Array<{ toolName: string }>;
            }>,
          ),
        };
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "RETRY_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
  });
}