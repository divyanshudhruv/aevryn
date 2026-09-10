import type { AskUserQuestion, AskUserOption } from "@aevryn/ui/components/ui/ask-user-questions";
import type { PlanIntakeQuestion } from "@aevryn/ui/lib/chat-types";

export const DEFAULT_PLAN_QUESTIONS: AskUserQuestion[] = [
	{
		id: "what",
		title: "What should Aevryn work on?",
		skippable: false,
		freeText: true,
	},
	{
		id: "goal",
		title: "What is the goal?",
		skippable: false,
		options: [
			{
				id: "goal-1",
				title: "Gather info",
				description: "Research, watch, and report back — no changes made.",
			},
			{
				id: "goal-2",
				title: "Direct action",
				description: "Actually buy, post, or change something for you.",
			},
			{
				id: "goal-3",
				title: "Change how I work",
				description: "Tailor Aevryn's behavior and preferences long-term.",
			},
		],
	},
	{
		id: "constraints",
		title: "What limits should Aevryn respect?",
		skippable: true,
		multiSelect: true,
		options: [
			{
				id: "constraints-1",
				title: "Budget",
				description: "Keep total spend under a price cap.",
			},
			{
				id: "constraints-2",
				title: "Time",
				description: "Finish within a set window.",
			},
			{
				id: "constraints-3",
				title: "Stealth mode",
				description: "No public posts, only private actions.",
			},
			{
				id: "constraints-4",
				title: "Nothing",
				description: "Give it full freedom.",
			},
		],
	},
	{
		id: "priority",
		title: "What matters most if things conflict?",
		skippable: true,
		options: [
			{
				id: "priority-1",
				title: "Getting it done",
				description: "Aevryn picks the fastest reliable path.",
			},
			{
				id: "priority-2",
				title: "Staying safe",
				description: "Nope out of anything risky or expensive.",
			},
		],
	},
	{
		id: "tone",
		title: "How should Aevryn sound?",
		skippable: true,
		options: [
			{
				id: "tone-1",
				title: "Concise",
				description: "Short, distilled updates.",
			},
			{
				id: "tone-2",
				title: "Thorough",
				description: "Techy, detailed, in-depth.",
			},
		],
	},
	{
		id: "notes",
		title: "Notes",
		skippable: true,
		freeText: true,
	},
];

/**
 * Convert the LLM-generated intake (as validated by `planIntakeQuestionSchema`
 * and returned by the API on `plan.intake`) into AskUserQuestion[] for the UI.
 *
 * The fixed product constraints are injected here — the LLM never emits them:
 * layout "stacked" (options always carry a description), chipPosition "right",
 * allowOther true on option questions, freeTextMultiline true on free-text
 * questions. Only skippable, multiSelect and the content itself come from
 * the LLM.
 */
export function intakeToQuestions(
	intake: PlanIntakeQuestion[] | null | undefined,
): AskUserQuestion[] {
	if (!intake || intake.length === 0) {
		return [];
	}
	return intake.map((q, i) => {
		const base = {
			id: q.id ?? `q-${i}`,
			title: q.title,
			skippable: q.skippable,
			chipPosition: "right" as const,
		};
		if (q.freeText) {
			return {
				...base,
				freeText: true,
				freeTextMultiline: true,
				freeTextPlaceholder: q.placeholder,
			} satisfies AskUserQuestion;
		}
		return {
			...base,
			layout: "stacked",
			allowOther: true,
			multiSelect: q.multiSelect,
			options: (q.options ?? []).map<AskUserOption>((o, oi) => ({
				id: `${base.id}-o-${oi}`,
				title: o.title,
				description: o.description,
			})),
		} satisfies AskUserQuestion;
	});
}