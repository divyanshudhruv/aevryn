import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import type { AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";
import {
	PlanApprovalCard,
	type PlanDecisionResult,
} from "@aevryn/ui/components/ui/plan-approval-card";
import type { ToolCallStepSegment } from "@aevryn/ui/components/ui/tool-call-step";

export function answersFromAskUserOutput(
	output: unknown,
): Record<string, AskUserAnswer> | undefined {
	if (output == null || typeof output !== "object") return undefined;
	const record = output as Record<string, unknown>;
	const answers = record.answers ?? record;
	if (answers == null || typeof answers !== "object") return undefined;
	const result: Record<string, AskUserAnswer> = {};
	for (const [questionId, value] of Object.entries(answers)) {
		const answer = value as Record<string, unknown>;
		if (answer == null || typeof answer !== "object") continue;
		result[questionId] = {
			questionId,
			selectedIds: Array.isArray(answer.selectedIds)
				? (answer.selectedIds as string[])
				: [],
			otherText:
				typeof answer.otherText === "string" ? answer.otherText : undefined,
			skipped: answer.skipped === true,
		};
	}
	return result;
}

export function decisionFromOutput(
	output: unknown,
): PlanDecisionResult | undefined {
	if (output == null || typeof output !== "object") return undefined;
	const record = output as Record<string, unknown>;
	const decision = record.decision as
		| PlanDecisionResult["decision"]
		| undefined;
	if (decision == null) return undefined;
	const feedback =
		typeof record.feedback === "string" ? record.feedback : undefined;
	return feedback ? { decision, feedback } : { decision };
}

export function AskUserCard({
	questions,
	answers,
	disabled,
	onComplete,
}: {
	questions: Array<Record<string, unknown>>;
	answers?: Record<string, AskUserAnswer>;
	disabled?: boolean;
	onComplete?: (answers: Record<string, AskUserAnswer>) => void;
}) {
	return (
		<QuestionFlow
			questions={questions as never}
			defaultAnswers={answers as never}
			disabled={disabled}
			onComplete={onComplete ?? (() => {})}
		/>
	);
}
