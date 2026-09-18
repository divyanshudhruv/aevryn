import { tool } from "ai";
import { z } from "zod";

/**
 * Client tools (no `execute`): the model emits the call, the AI SDK streams
 * it as a tool-input part, the UI renders it (QuestionFlow / plan card), and
 * the human's answer returns into the loop via `addToolResult` /
 * `addToolApprovalResponse`. Task 9 wires the client side.
 */

// ─── askUser ────────────────────────────────────────────────────────────────
// Mirrors @aevryn/ui `AskUserQuestion` minus view-only fields (chipPosition,
// nextLabel, freeTextValidate are render-side and never sent to the model).

const questionOptionSchema = z.object({
	id: z.string().optional().describe("Stable id returned in the answer."),
	title: z.string().min(1),
	description: z.string().optional(),
});

export const askUserQuestionSchema = z
	.object({
		id: z.string().optional().describe("Stable id echoed in the answer."),
		title: z.string().min(1),
		options: z.array(questionOptionSchema).optional(),
		multiSelect: z.boolean().optional(),
		allowOther: z.boolean().optional(),
		otherPlaceholder: z.string().optional(),
		skippable: z.boolean().optional(),
		layout: z.enum(["inline", "stacked"]).optional(),
		freeText: z
			.boolean()
			.optional()
			.describe("Single multi-line textarea as the ONLY answer (no options)."),
		freeTextPlaceholder: z.string().optional(),
		freeTextMultiline: z.boolean().optional(),
	})
	// A question is either option-based or free-text — never an optionless
	// non-free-text question (the UI would have nothing to render).
	.refine(
		(q) => q.freeText === true || (q.options != null && q.options.length > 0),
		{ message: "Provide options, or set freeText: true." },
	);

/**
 * Accepts a bare array of questions OR `{ questions: [...] }` — weaker
 * models often wrap the array in an object, and strict validation would
 * kill the turn. Both normalize to the array the UI expects.
 */
const askUserInputSchema = z
	.union([
		z.array(askUserQuestionSchema).min(1).max(6),
		z.object({ questions: z.array(askUserQuestionSchema).min(1).max(6) }),
	])
	.transform(
		(value): Array<z.infer<typeof askUserQuestionSchema>> =>
			Array.isArray(value) ? value : value.questions,
	);

export const askUserTool = tool({
	description:
		"Ask clarifying questions via an interactive card. ALWAYS use this tool instead of typing questions as markdown text — plain-text question lists are a bug, not a style. Use BEFORE presentPlan whenever the request is vague or missing params (dates, cities, budget, preferences, user decisions). Pauses conversation until answered. Write 1–2 sentences of text BEFORE this call explaining why you're asking — never emit the card alone. Pass questions as top-level ARRAY: [{ title: '...', options: [{ title: '...' }] }].",
	inputSchema: askUserInputSchema,
	// No contextSchema needed: the tool carries no per-request state.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- client tool has no execute
} as any);

// ─── presentPlan ────────────────────────────────────────────────────────────
// The plan card. On approve, ChatService.createWorkflowFromPlan persists the
// workflow + plan_steps BEFORE the approval response resumes the loop; the
// agent then executes step-by-step with updateStepStatus.

export const presentPlanTool = tool({
	description:
		"Present multi-step plan as approve/decline card. Use before burning significant credits, long-running, or write work. Prerequisite: if the request is still vague (missing key params), call askUser FIRST and presentPlan on the next turn — never in the same turn. Write 1–2 sentences of text BEFORE this call summarizing the approach — never emit the card alone. On approval: plan bound to thread as workflow, execute step by step.",
	inputSchema: z.object({
		title: z
			.string()
			.min(1)
			.describe("Short plan name, e.g. 'Track GPU prices daily'."),
		objective: z
			.string()
			.min(1)
			.describe("What this plan accomplishes for the user."),
		summary: z.string().optional().describe("One-line strategy summary."),
		steps: z
			.array(
				z.object({
					title: z.string().min(1),
					description: z
						.string()
						.describe(
							"What this step concretely does — shown in the review accordion.",
						),
				}),
			)
			.min(1)
			.max(12)
			.describe("Ordered execution steps."),
	}),
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- client tool has no execute
} as any);
