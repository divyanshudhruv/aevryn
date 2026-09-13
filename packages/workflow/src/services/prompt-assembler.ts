import type { Db } from "@aevryn/db";
import { db, globalSettings, threadSettings } from "@aevryn/db";
import { eq } from "drizzle-orm";

/**
 * Prompt assembler — THE one place that builds the system prompt.
 * Chat, planning, and the durable runner call this with different flags;
 * none of them write their own instruction fragments. Reads workspace
 * defaults (global_settings) and per-thread overrides (thread_settings).
 */

export interface AssembledSettings {
	instructions: string;
	prompts: string[];
	autoApproveClasses: string[];
}

export interface AssemblePromptInput {
	workspaceId: string;
	threadId?: string;
	/** Extra context blocks (memory hits, plan state, session info). */
	contextBlocks?: string[];
	/** Durable-run guidance flag: runner passes true, chat false. */
	durable?: boolean;
	/** Planning instructions flag. */
	planning?: boolean;
}

const CORE_PERSONA = `You are Aevryn, a capable and careful agent.
- Work step by step and show what you are doing.
- Use tools when they help; do not invent tool results.
- Ask clarifying questions when the request is ambiguous.
- Before any consequential or sensitive action, request approval unless the action class is auto-approved.`;

const TOOL_POLICY = `Tool policy:
- One tool call at a time; wait for the result before deciding the next step.
- Treat tool failures as information: report them and adapt instead of retrying blindly.`;

const DURABLE_GUIDANCE = `Durable execution guidance:
- You may pause: emit a sleep/wait marker when waiting on external events.
- State is durable: assume the run can resume after a pause; never assume in-memory state survives.`;

const PLANNING_GUIDANCE = `Planning guidance:
- Maintain the plan steps for the bound workflow: update statuses as work progresses.
- Add, edit, or reorder steps when the goal changes.`;

function parseSettings(raw: string | undefined | null): Partial<AssembledSettings> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			instructions:
				typeof parsed.instructions === "string" ? parsed.instructions : "",
			prompts: Array.isArray(parsed.prompts)
				? (parsed.prompts.filter((p) => typeof p === "string") as string[])
				: [],
			autoApproveClasses: Array.isArray(parsed.autoApproveClasses)
				? (parsed.autoApproveClasses.filter(
						(c) => typeof c === "string",
					) as string[])
				: [],
		};
	} catch {
		return {};
	}
}

export class PromptAssembler {
	constructor(private readonly client: Db = db) {}

	async loadSettings(input: {
		workspaceId: string;
		threadId?: string;
	}): Promise<AssembledSettings> {
		const workspaceRow = await this.client.query.globalSettings.findFirst({
			where: eq(globalSettings.workspaceId, input.workspaceId),
		});
		const wsSettings = parseSettings(workspaceRow?.settings);

		let threadOverrides: Partial<AssembledSettings> = {};
		if (input.threadId) {
			const threadRow = await this.client.query.threadSettings.findFirst({
				where: eq(threadSettings.threadId, input.threadId),
			});
			threadOverrides = parseSettings(threadRow?.settings);
		}

		return {
			instructions:
				threadOverrides.instructions || wsSettings.instructions || "",
			prompts: threadOverrides.prompts?.length
				? threadOverrides.prompts
				: (wsSettings.prompts ?? []),
			autoApproveClasses:
				threadOverrides.autoApproveClasses?.length
					? threadOverrides.autoApproveClasses
					: (wsSettings.autoApproveClasses ?? []),
		};
	}

	async assemble(input: AssemblePromptInput): Promise<string> {
		const settings = await this.loadSettings(input);
		const blocks: string[] = [CORE_PERSONA, TOOL_POLICY];

		if (input.durable) {
			blocks.push(DURABLE_GUIDANCE);
		}
		if (input.planning) {
			blocks.push(PLANNING_GUIDANCE);
		}

		if (settings.autoApproveClasses.length > 0) {
			blocks.push(
				`Auto-approved action classes (no approval pause needed): ${settings.autoApproveClasses.join(", ")}`,
			);
		}
		if (settings.instructions) {
			blocks.push(`User instructions:\n${settings.instructions}`);
		}
		if (settings.prompts.length > 0) {
			blocks.push(`Standing prompts:\n${settings.prompts.join("\n")}`);
		}
		for (const block of input.contextBlocks ?? []) {
			if (block) {
				blocks.push(block);
			}
		}

		return blocks.join("\n\n");
	}
}

export const promptAssembler = new PromptAssembler();
