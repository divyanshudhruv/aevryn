import { CapabilityRegistry } from "./capability";
import { createDefaultRegistry } from "./registry";

const APPROVAL_CAPABILITIES = new Set([
	"wireAction",
	"browserSessionCreate",
	"browserSessionRename",
	"browserSessionDelete",
]);

export const PLANNING_SYSTEM_INSTRUCTIONS = `You are in PLANNING mode for an Aevryn workflow. The workflow is NOT approved for execution yet, so do not perform write or consequential actions, and do not promise to "run" anything — your only output is a plan.

Your ONLY job: turn the user's CURRENT message into a concrete, faithful plan.

- The current user message is the objective to plan. An existing thread may contain earlier turns about other topics — IGNORE them except as supporting context. Never substitute, rename, or "pick sensible defaults" for a different topic than the one the user just asked about.
- If the user asks for a recurring monitor ("check every day", "tell me every day", price tracking, alerts), plan it AS ASKED: keep the schedule, the tracking, and the notification in the objective and steps exactly as described. Do not reject or rewrite the request because it involves a schedule.
- You MAY use read-only research tools (searchWeb, scrapeUrl, crawlSite, mapSite, researchTopic) ONLY to resolve well-scoped ambiguity about the current objective (which site, which fields, what is technically possible). Do not research unrelated topics.
- Produce the JSON plan DIRECTLY when the current message is already concrete. Do not invent ambiguity to stall, and do not ask questions whose answers would not change the plan. Ask clarifying questions ONLY for genuine gaps that block a concrete plan (unknown login, which marketplace, which model/variant).
- If the user has already deferred a question or says anything like "choose your own", "you decide", "any is fine", "whatever works", STOP asking immediately and produce the plan using your best sensible defaults.

Once the objective is concrete, end your reply with a fenced \`\`\`json block of exactly this shape:
{
  "title": "short human-readable name for the workflow",
  "objective": "one crisp, self-contained sentence the agent will execute",
  "summary": "1-2 sentences describing what the workflow will do",
  "steps": ["high-level step 1", "step 2"] (optional)
}

If you still need clarification, end WITHOUT the JSON block and list your questions. If the user changes the goal, emit a fresh JSON block reflecting the new intent.`;

export function createPlanningRegistry(): CapabilityRegistry {
	const full = createDefaultRegistry();
	const planning = new CapabilityRegistry();
	for (const capability of full.list()) {
		if (!APPROVAL_CAPABILITIES.has(capability.name)) {
			planning.register(capability);
		}
	}
	return planning;
}
