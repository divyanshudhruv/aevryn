"use client";

import { useEffect, useState } from "react";

import {
  AskUserQuestions,
  type AskUserAnswer,
  type AskUserQuestion,
} from "@aevryn/ui/components/ui/ask-user-questions";
import { QaAccordion, buildQaItems } from "@aevryn/ui/components/qa-accordion";
import { Button } from "@aevryn/ui/components/ui/button";
import { toolDisplayName } from "@aevryn/ui/components/tool-step-card";
import type {
  ApprovalInfo,
  ApprovalResolve,
  PlanIntakeQuestion,
} from "@aevryn/ui/lib/chat-types";
import { intakeToQuestions } from "@aevryn/ui/lib/plan-intake";

// The exact shape the LLM emits in the planning JSON (`plan.intake`,
// validated by `planIntakeQuestionSchema`). The converter below injects the
// fixed product constraints — stacked layout with descriptions, chip on the
// right, allowOther, multi-line freeText — so this only declares content,
// skippable and multiSelect. Includes freeText and option questions, multi
// select, skippable and non-skippable variants.
const PLAN_INTAKE: PlanIntakeQuestion[] = [
  {
    freeText: true,
    id: "what",
    title: "What should we build?",
    skippable: false,
    placeholder: "Describe the task in a sentence…",
  },
  {
    freeText: false,
    id: "goal",
    title: "What's the primary goal?",
    skippable: false,
    options: [
      {
        title: "Ship to launch",
        description: "Get it in front of users fast, refine later.",
      },
      {
        title: "Polished first",
        description: "Invest in craft and robustness before anything else.",
      },
      {
        title: "Validate demand",
        description: "Prove people actually want this before building further.",
      },
    ],
  },
  {
    freeText: false,
    id: "audience",
    title: "Who's this for?",
    skippable: false,
    multiSelect: true,
    options: [
      {
        title: "Indie founders",
        description: "Small teams shipping fast.",
      },
      {
        title: "Engineers",
        description: "Technical users who build and integrate.",
      },
      {
        title: "Operations",
        description: "People running the day-to-day.",
      },
    ],
  },
  {
    freeText: false,
    id: "note",
    title: "What matters most?",
    skippable: false,
    multiSelect: true,
    options: [
      {
        title: "Speed",
        description: "Fast to ship and fast to use.",
      },
      {
        title: "Clarity",
        description: "Obvious, unsurprising UX.",
      },
      {
        title: "Openness",
        description: "Extensible, transparent, no vendor lock-in.",
      },
    ],
  },
  {
    freeText: false,
    id: "tone",
    title: "What tone should it speak in?",
    skippable: true,
    options: [
      {
        title: "Friendly",
        description: "Warm, conversational, human.",
      },
      {
        title: "Professional",
        description: "Polished, direct, no frills.",
      },
      {
        title: "Technical",
        description: "Deep, precise, jargon when useful.",
      },
    ],
  },
  {
    freeText: true,
    id: "notes",
    title: "Anything else to consider?",
    skippable: true,
    placeholder: "Constraints, references, ideas…",
  },
];

const PLAN_QUESTIONS: AskUserQuestion[] = intakeToQuestions(PLAN_INTAKE);

const RESOLVE_QUESTIONS: AskUserQuestion[] = [
  {
    id: "resolve",
    title: "Approve this action?",
    layout: "stacked",
    allowOther: true,
    otherPlaceholder: "Write a modification or message (optional)…",
    nextLabel: "Finish",
    options: [
      {
        id: "approve",
        title: "Approve",
        description: "Continue the workflow with this action.",
      },
      {
        id: "deny",
        title: "Deny",
        description: "Stop — do not perform this action.",
      },
    ],
  },
];

const PENDING_APPROVAL: ApprovalInfo = {
  id: "ap_1",
  executionId: "run_1",
  toolName: "web_search",
  status: "pending",
  input: { query: "linear pricing plans" },
  reason: null,
  createdAt: new Date().toISOString(),
  decidedAt: null,
};

const DECIDED: ApprovalInfo[] = [
  {
    id: "ap_2",
    executionId: "run_2",
    toolName: "create_file",
    status: "approved",
    input: { path: "pricing.mdx" },
    reason: "Looks good",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    decidedAt: new Date(Date.now() - 3_400_000).toISOString(),
  },
  {
    id: "ap_3",
    executionId: "run_3",
    toolName: "send_email",
    status: "denied",
    input: { to: "team@aevryn.com" },
    reason: "Not yet, wait for launch",
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    decidedAt: new Date(Date.now() - 7_000_000).toISOString(),
  },
];

function formatTime(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The demo fixtures are rendered on the server too; locale-formatted clocks
 *  differ between Node and the browser and would break hydration. Show the
 *  time only after mount. */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function CardsPreviewPage() {
  const [answers, setAnswers] = useState<Record<string, AskUserAnswer> | null>(
    null,
  );
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [pending, setPending] = useState<ApprovalInfo>(PENDING_APPROVAL);
  const hydrated = useHydrated();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 overflow-y-auto p-6">
      <Section title="Planning — draft (multi-question intake)">
        {answers ? (
          <div className="flex flex-col gap-2">
            <QaAccordion items={buildQaItems(PLAN_QUESTIONS, answers)} />
            {confirmBusy ? (
              <p className="px-1 text-[12px] text-muted-foreground">
                Starting execution…
              </p>
            ) : (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAnswers(null)}
                >
                  Discard plan
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setConfirmBusy(true);
                    window.setTimeout(() => {
                      setConfirmBusy(false);
                      alert("Plan confirmed — run started");
                    }, 800);
                  }}
                >
                  Start execution
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <AskUserQuestions
              questions={PLAN_QUESTIONS}
              onComplete={(done) => setAnswers(done)}
            />
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  alert("Plan discarded (not wired to backend in this preview)")
                }
              >
                Discard plan
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title="Approval — pending">
        <div className="flex items-baseline gap-2 px-1 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {toolDisplayName(pending.toolName)}
          </span>
          <span>wants to run</span>
          {hydrated && formatTime(pending.createdAt) && (
            <span className="text-muted-foreground/60">
              {formatTime(pending.createdAt)}
            </span>
          )}
        </div>
        {resolveBusy ? (
          <p className="px-1 text-[12px] text-muted-foreground">Resolving…</p>
        ) : (
          <AskUserQuestions
            questions={RESOLVE_QUESTIONS}
            onComplete={(done) => {
              const answer = done["resolve"];
              if (!answer) return;
              const deny = answer.selectedIds.includes("deny");
              const reason =
                answer.otherText && answer.otherText.trim() !== ""
                  ? answer.otherText.trim()
                  : undefined;
              setResolveBusy(true);
              window.setTimeout(() => {
                setPending({
                  ...pending,
                  status: deny ? "denied" : "approved",
                  reason: reason ?? null,
                  decidedAt: new Date().toISOString(),
                });
                setResolveBusy(false);
              }, 400);
            }}
          />
        )}
      </Section>

      <Section title="Approval — decided">
        <div className="flex flex-col gap-1 px-1">
          {DECIDED.concat(
            pending.status === "pending" ? [] : [pending],
          ).map((approval) => (
            <div
              key={approval.id}
              className="flex items-baseline gap-2 text-[12px] text-muted-foreground"
            >
              <span
                className={
                  approval.status === "denied"
                    ? "font-medium text-red-500"
                    : "font-medium text-emerald-600"
                }
              >
                {approval.status === "denied" ? "Denied" : "Approved"}
              </span>
              <span>{toolDisplayName(approval.toolName)}</span>
              {hydrated && formatTime(approval.decidedAt) && (
                <span className="text-muted-foreground/60">
                  {formatTime(approval.decidedAt)}
                </span>
              )}
              {approval.reason && (
                <span className="truncate text-muted-foreground/70">
                  · “{approval.reason}”
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}