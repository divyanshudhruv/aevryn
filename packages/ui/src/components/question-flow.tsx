"use client";

import { type ComponentProps } from "react";
import {
  AskUserQuestions,
  type AskUserQuestion,
} from "@aevryn/ui/components/ui/ask-user-questions";

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
      className="flex flex-col full"
    />
  );
}
