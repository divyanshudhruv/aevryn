"use client";

import {
	type AskUserQuestion,
	AskUserQuestions,
} from "@aevryn/ui/components/ui/ask-user-questions";
import type { ComponentProps } from "react";

// Generated from a fluidfunctionalism.com playground preset —
// swap the questions for your own.

export function QuestionFlow({
	questions,
	...props
}: {
	questions: AskUserQuestion[];
} & Omit<ComponentProps<typeof AskUserQuestions>, "questions">) {
	return (
		<AskUserQuestions
			questions={questions}
			{...props}
			className="full flex flex-col"
		/>
	);
}
