"use client";

import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import {
  AccordionGroup,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@aevryn/ui/components/ui/accordion";
import type { AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";
import { cn } from "@aevryn/ui/lib/utils";
import { useEffect, useState } from "react";

export interface PlanInput {
  title: string;
  objective: string;
  summary?: string;
  steps: Array<{ title: string; description?: string }>;
}

export type PlanDecision =
  | "approved"
  | "declined"
  | "bound"
  | "changes_requested";

export interface PlanDecisionResult {
  decision: PlanDecision;
  feedback?: string;
}

export interface PlanApprovalCardProps {
  plan: PlanInput;
  onDecision: (result: PlanDecisionResult) => void;
  className?: string;
  /** Read-only: show an already-made decision instead of collecting one. */
  completed?: boolean;
  decision?: PlanDecision;
  feedback?: string;
}

const DECISION_OPTIONS = [
  {
    id: "approve",
    title: "Approve",
    description: "Run the plan now, step by step.",
  },
  {
    id: "bind",
    title: "Bind",
    description: "Bind it to this thread and run it later.",
  },
  {
    id: "request-changes",
    title: "Request changes",
    description: "Tell the agent what to adjust.",
  },
  {
    id: "decline",
    title: "Decline",
    description: "Stay in chat and adjust manually.",
  },
] as const;

function decisionBannerLabel(decision: PlanDecision | undefined): string {
  switch (decision) {
    case "approved":
      return "Plan approved \u2014 executing now";
    case "bound":
      return "Plan approved and bound to this thread";
    case "changes_requested":
      return "Changes requested";
    case "declined":
      return "Plan declined \u2014 staying in chat";
    default:
      return "Decision recorded";
  }
}

export function PlanApprovalCard({
  plan,
  onDecision,
  className,
  completed = false,
  decision,
  feedback,
}: PlanApprovalCardProps) {
  const [decided, setDecided] = useState(false);

  // Unmount safety: if the card goes away before the user answers
  // (thread switch), the parent decides what "no answer" means.
  useEffect(() => () => setDecided(false), []);

  const handleComplete = (answers: Record<string, AskUserAnswer>) => {
    if (decided) return;
    const answer = answers.decision;
    const selected = answer?.selectedIds?.[0];
    if (!selected) return;
    const feedback = answers["changes-feedback"]?.otherText?.trim();
    const result: PlanDecisionResult =
      selected === "request-changes"
        ? {
            decision: "changes_requested",
            ...(feedback ? { feedback } : {}),
          }
        : {
            decision:
              selected === "approve"
                ? "approved"
                : selected === "bind"
                  ? "bound"
                  : "declined",
          };
    setDecided(true);
    onDecision(result);
  };

  return (
    <div className={cn(className, "min-w-full")}>
      {completed && (
        <div
          role="status"
          className="mb-3 flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-[13px] text-foreground"
        >
          <span className="font-medium">{decisionBannerLabel(decision)}</span>
          {decision === "changes_requested" && feedback && (
            <span className="text-muted-foreground">{`“${feedback}”`}</span>
          )}
        </div>
      )}
      <div className="mb-3 flex flex-col gap-1">
        <span className="text-[16px] font-medium text-foreground ">
          {plan.title}
        </span>
        <span className="text-muted-foreground">{plan.objective}</span>
        {plan.summary && (
          <span className="text-muted-foreground/80">{plan.summary}</span>
        )}
      </div>

      <AccordionGroup type="single" className="mb-3 w-full" collapsible>
        {plan.steps.map((step, i) => (
          <AccordionItem
            key={`${step.title}-${i}`}
            value={`step-${i}`}
            index={i}
          >
            <AccordionTrigger>{`${i + 1}. ${step.title}`}</AccordionTrigger>
            <AccordionContent>
              {step.description ?? "No further details for this step."}
            </AccordionContent>
          </AccordionItem>
        ))}
      </AccordionGroup>

      <QuestionFlow
        questions={[
          {
            id: "decision",
            title: "What would you like to do with this plan?",
            layout: "stacked",
            options: DECISION_OPTIONS.map((option) => ({
              id: option.id,
              title: option.title,
              description: option.description,
            })),
            nextLabel: "Submit",
          },
        ]}
        className="w-full"
        onComplete={handleComplete}
        disabled={completed}
      />
    </div>
  );
}

export default PlanApprovalCard;
