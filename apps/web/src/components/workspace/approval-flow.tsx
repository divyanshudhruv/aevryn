"use client";

import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import type { AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";

/**
 * Renders a pending approval request as a one-question approve/deny flow.
 * The tool input is summarized in the question title; the decision is
 * forwarded to the resolve endpoint by the thread page.
 */
export function ApprovalFlow({
  toolName,
  input,
  onDecide,
}: {
  toolName: string;
  input: unknown;
  onDecide: (decision: "approved" | "denied") => void;
}) {
  const inputSummary = (() => {
    try {
      const json = JSON.stringify(input, null, 2);
      return json.length > 600 ? `${json.slice(0, 600)}…` : json;
    } catch {
      return String(input);
    }
  })();

  const handleComplete = (answers: Record<string, AskUserAnswer>) => {
    const key = Object.keys(answers)[0] ?? "";
    const answer = answers[key];
    const value =
      answer && typeof answer === "object"
        ? JSON.stringify(answer).toLowerCase()
        : "";
    onDecide(value.includes("approve") ? "approved" : "denied");
  };

  return (
    <div className="w-full py-2">
      <QuestionFlow
        questions={[
          {
            id: "approval",
            title: `Allow “${toolName}”?`,
            options: [
              { id: "approve", title: "Approve" },
              { id: "deny", title: "Deny" },
            ],
            nextLabel: "Submit",
          },
        ]}
        onComplete={handleComplete}
      />
      <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
        {inputSummary}
      </pre>
    </div>
  );
}
