"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { MessageThread } from "@aevryn/ui/components/message-thread";
import {
  AskUserQuestions,
  type AskUserAnswer,
  type AskUserQuestion,
} from "@aevryn/ui/components/ui/ask-user-questions";
import { intakeToQuestions } from "@aevryn/ui/lib/plan-intake";
import {
  QaAccordion,
  type QaItem,
} from "@aevryn/ui/components/qa-accordion";
import { Button } from "@aevryn/ui/components/ui/button";
import { toolDisplayName } from "@aevryn/ui/components/tool-step-card";
import type {
  ApprovalInfo,
  ApprovalResolve,
  PlanInfo,
  PlanProgressInfo,
} from "@aevryn/ui/lib/chat-types";
import {
  SidebarInset,
  SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceHeader } from "@/components/workspace-header";
import { trpc, queryClient } from "@/utils/trpc";
import { useThreadStore } from "@/stores/thread-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useUIStore } from "@/stores/ui-store";
import {
  useMessageStore,
  type Message,
  type StepCall,
} from "@/stores/message-store";

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

function invalidateThread() {
  queryClient.invalidateQueries({
    queryKey: [["agent.getThread"]],
  });
  queryClient.invalidateQueries({
    queryKey: [["agent.listRuns"]],
  });
}

function formatTimeLabel(iso?: string | null): string {
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

function resolveFromAnswers(
  answers: Record<string, AskUserAnswer>,
  onResolve: (resolve: ApprovalResolve, reason?: string) => void,
) {
  const answer = answers["resolve"];
  if (!answer) return;
  const deny = answer.selectedIds.includes("deny");
  const reason =
    answer.otherText && answer.otherText.trim() !== ""
      ? answer.otherText.trim()
      : undefined;
  onResolve(deny ? "deny" : "approve", reason);
}

function resolveRunFromAnswers(
  answers: Record<string, AskUserAnswer>,
  onRun: () => void,
  onDeny: () => void,
) {
  const answer = answers["run"];
  if (!answer) return;
  if (answer.selectedIds.includes("deny")) onDeny();
  else onRun();
}

// Gate for the first run of a finalized plan: an approval-style question for
// "Run it" / "Not now". Later runs use the Run button in the workspace header.
const RUN_QUESTIONS: AskUserQuestion[] = [
  {
    id: "run",
    title: "Ready to run this workflow?",
    layout: "stacked",
    allowOther: true,
    otherPlaceholder: "Note (optional)…",
    nextLabel: "Finish",
    options: [
      {
        id: "accept",
        title: "Run it",
        description: "Start the workflow now.",
      },
      {
        id: "deny",
        title: "Not now",
        description: "Keep the plan, do not start.",
      },
    ],
  },
];

function planKindLabel(
  status: string | undefined,
  steps: string[],
  progress: PlanProgressInfo | null,
): string {
  if (status === "completed")
    return `${steps.length}/${steps.length || "–"} done`;
  if (progress?.status === "in_progress")
    return `${Math.max(0, Math.min(progress.currentStep, steps.length))}/${
      steps.length || "–"
    } · running`;
  if (status === "draft" || !status) return "Draft";
  return status.replace(/_/g, " ");
}

/** Fallback question→answer accordion items for a plan that has already been
 *  confirmed (the tool-bind intake answers aren't stored server-side, so after
 *  a reload we rebuild the review from the saved plan + progress instead). */
function buildPlanFallbackItems(
  plan: PlanInfo,
  progress: PlanProgressInfo | null,
  steps: string[],
): QaItem[] {
  const items: QaItem[] = [];
  const state = progress?.status ?? null;
  const doneCount =
    state === "completed"
      ? steps.length
      : state === "in_progress"
        ? Math.max(0, Math.min(progress?.currentStep ?? 0, steps.length))
        : 0;

  if (plan.objective?.trim()) {
    items.push({
      id: "objective",
      question: "Objective",
      answer: plan.objective,
    });
  }
  if (plan.summary && plan.summary !== plan.objective) {
    items.push({ id: "summary", question: "Summary", answer: plan.summary });
  }
  steps.forEach((step, index) => {
    const isDone = index < doneCount;
    const isCurrent =
      !isDone && index === doneCount && state === "in_progress";
    items.push({
      id: `step-${index}`,
      question: `Step ${index + 1}`,
      answer: (
        <span
          className={
            isDone
              ? "line-through decoration-muted-foreground/30"
              : isCurrent
                ? "text-foreground"
                : undefined
          }
        >
          {step}
        </span>
      ),
    });
  });
  if (state === "in_progress" && progress?.note) {
    items.push({
      id: "note",
      question: "Current status",
      answer: <span className="italic">{progress.note}</span>,
    });
  }
  return items;
}

/** Intake interview for a draft plan: the planner's open questions → on
 *  complete the answers are sent back for the refine round (plan finalized).
 *  While the refine run is queued/running, show a busy line instead. */
function PlanDraft({
  questions,
  refining,
  onAnswers,
  onDiscardPlan,
}: {
  questions: AskUserQuestion[];
  refining: boolean;
  onAnswers: (answers: Record<string, AskUserAnswer>) => void;
  onDiscardPlan: () => void;
}) {
  return (
    <>
      {refining ? (
        <p className="px-1 text-[12px] text-muted-foreground">
          Refining the plan with your answers…
        </p>
      ) : (
        <AskUserQuestions questions={questions} onComplete={onAnswers} />
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onDiscardPlan}>
          Discard plan
        </Button>
      </div>
    </>
  );
}

/** Finalized plan awaiting its first run: accordion of the saved plan +
 *  an approval-style "Run it / Not now" gate. Later runs come from the
 *  Run button in the workspace header. */
function FinalizedPlan({
  plan,
  progress,
  steps,
  runBusy,
  onRun,
  onDiscardPlan,
}: {
  plan: PlanInfo;
  progress: PlanProgressInfo | null;
  steps: string[];
  runBusy: boolean;
  onRun: () => void;
  onDiscardPlan: () => void;
}) {
  const [runDenied, setRunDenied] = useState(false);
  const [runKey, setRunKey] = useState(0);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {plan.title || "Plan"}
        </span>
        {" · "}
        Ready to run
      </p>
      <QaAccordion items={buildPlanFallbackItems(plan, progress, steps)} />
      {runBusy ? (
        <p className="px-1 text-[12px] text-muted-foreground">
          Starting execution…
        </p>
      ) : runDenied ? (
        <div className="flex items-center justify-end gap-2">
          <p className="px-1 text-[12px] text-muted-foreground">
            Not started. Run it whenever you're ready.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRunDenied(false);
              setRunKey((key) => key + 1);
            }}
          >
            Run it
          </Button>
        </div>
      ) : (
        <AskUserQuestions
          key={runKey}
          questions={RUN_QUESTIONS}
          onComplete={(answers) =>
            resolveRunFromAnswers(answers, onRun, () => {
              setRunDenied(true);
              setRunKey((key) => key + 1);
            })
          }
        />
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onDiscardPlan}>
          Discard plan
        </Button>
      </div>
    </div>
  );
}

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = params.threadId;

  const { updateThread } = useThreadStore();
  const { setWorkflow } = useWorkflowStore();
  const { setMessages } = useMessageStore();
  const composerDisabled = useUIStore((s) => s.composerDisabled);
  const setActiveApproval = useUIStore((s) => s.setActiveApproval);

  const { data, isLoading } = useQuery(
    trpc.agent.getThread.queryOptions({ workflowId: threadId }),
  );

  useEffect(() => {
    if (!data) return;
    updateThread(threadId, {
      objective: data.workflow.objective ?? "Untitled thread",
      status: data.workflow.status,
    });
    setWorkflow(threadId, {
      id: data.workflow.id,
      threadId,
      status: data.workflow.status,
      objective: data.workflow.objective ?? "",
      createdAt: data.workflow.createdAt,
    });
  }, [data, threadId, updateThread, setWorkflow]);

  useEffect(() => {
    if (!data) return;
    const built: Message[] = [];
    for (const turn of data.turns) {
      built.push({
        id: `user-${turn.execution.id}`,
        threadId,
        role: "user",
        content: turn.prompt ?? "",
        createdAt: toIsoOrNow(turn.execution.startedAt),
      });
      const assistantText = turn.steps
        .map((s) => s.text)
        .filter(Boolean)
        .join("\n");
      const toolCalls: StepCall[] = turn.toolExecutions.map((tool) => ({
        id: tool.id,
        toolName: tool.tool,
        input: (tool.input as Record<string, unknown>) ?? {},
        status:
          tool.status === "called"
            ? "running"
            : tool.status === "completed"
              ? "completed"
              : "failed",
        output: tool.output
          ? JSON.stringify(tool.output).slice(0, 2000)
          : undefined,
        startedAt: new Date().toISOString(),
      }));
      built.push({
        id: `assistant-${turn.execution.id}`,
        threadId,
        role: "assistant",
        content: assistantText,
        createdAt: toIsoOrNow(turn.execution.completedAt ?? turn.execution.startedAt),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }
    setMessages(threadId, built);
  }, [data, threadId, setMessages]);

  // Block the composer while any approval is pending, and track the active
  // approval so the question stays visible at the bottom of the chat.
  useEffect(() => {
    if (!data) return;
    const pending = data.approvals.find((a) => a.status === "pending");
    setActiveApproval(
      pending
        ? {
            id: pending.id,
            toolName: pending.toolName,
            input: (pending.input ?? {}) as Record<string, unknown>,
            workflowId: threadId,
            executionId: pending.executionId ?? "",
            createdAt: pending.createdAt,
          }
        : null,
    );
  }, [data, threadId, setActiveApproval]);

  const sendMessage = useMutation(
    trpc.agent.sendMessage.mutationOptions({ onSuccess: invalidateThread }),
  );
  const answerIntake = useMutation(
    trpc.agent.answerIntake.mutationOptions({ onSuccess: invalidateThread }),
  );
  const confirmWorkflow = useMutation(
    trpc.agent.confirmWorkflow.mutationOptions({ onSuccess: invalidateThread }),
  );
  const discardPlan = useMutation(
    trpc.agent.discardPlan.mutationOptions({ onSuccess: invalidateThread }),
  );
  const resolveApproval = useMutation(
    trpc.agent.resolveApproval.mutationOptions({ onSuccess: invalidateThread }),
  );

  const approvals: ApprovalInfo[] = (data?.approvals ?? []).map((approval) => ({
    id: approval.id,
    executionId: approval.executionId ?? "",
    toolName: approval.toolName,
    status: approval.status,
    input: (approval.input ?? {}) as Record<string, unknown>,
    reason: approval.reason ?? null,
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt ?? null,
  }));
  const plan: PlanInfo | null = data?.plan ?? null;
  const planProgress: PlanProgressInfo | null =
    (data?.planProgress as PlanProgressInfo | null) ?? null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex h-full min-h-0 flex-col">
          <WorkspaceHeader />
          <section
            aria-label="Conversation"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex min-h-full max-w-3xl flex-col">
              <div className="flex-1 p-4">
                {isLoading && !data ? (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">
                    Loading thread…
                  </p>
                ) : (
                  <ViewThread
                    threadId={threadId}
                    plan={plan}
                    planProgress={planProgress}
                    workflowStatus={data?.workflow.status}
                    approvals={approvals}
                    answerIntakeBusy={answerIntake.isPending}
                    confirmBusy={confirmWorkflow.isPending}
                    onAnswerIntake={(answers) =>
                      answerIntake.mutate({ workflowId: threadId, answers })
                    }
                    onConfirmPlan={() =>
                      confirmWorkflow.mutate({ workflowId: threadId })
                    }
                    onDiscardPlan={() =>
                      discardPlan.mutate({ workflowId: threadId })
                    }
                    resolveBusy={resolveApproval.isPending}
                    onResolveApproval={(approval) => (resolve, reason) =>
                      resolveApproval.mutate({
                        approvalId: approval.id,
                        workflowId: threadId,
                        resolve,
                        reason,
                      })
                    }
                  />
                )}
              </div>
            </div>
          </section>
          <footer className="shrink-0 p-3">
            <div className="mx-auto max-w-3xl">
              <ChatComposer
                demo={false}
                disabled={composerDisabled}
                onSubmitMessage={(text) =>
                  sendMessage.mutate({ workflowId: threadId, message: text })
                }
              />
            </div>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

interface ViewThreadProps {
  threadId: string;
  plan: PlanInfo | null;
  planProgress: PlanProgressInfo | null;
  workflowStatus?: string;
  approvals: ApprovalInfo[];
  answerIntakeBusy: boolean;
  confirmBusy: boolean;
  onAnswerIntake: (answers: Record<string, AskUserAnswer>) => void;
  onConfirmPlan: () => void;
  onDiscardPlan: () => void;
  resolveBusy: boolean;
  onResolveApproval: (approval: ApprovalInfo) => (
    resolve: ApprovalResolve,
    reason?: string,
  ) => void;
}

function ViewThread({
  threadId,
  plan,
  planProgress,
  workflowStatus,
  approvals,
  answerIntakeBusy,
  confirmBusy,
  onAnswerIntake,
  onConfirmPlan,
  onDiscardPlan,
  resolveBusy,
  onResolveApproval,
}: ViewThreadProps) {
  const messages = useMessageStore((s) => s.messagesByThread[threadId] ?? []);
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");
  const hasIntake = (plan?.intake?.length ?? 0) > 0;
  const steps = plan?.steps ?? [];

  if (messages.length === 0 && !plan) {
    return (
      <p className="py-8 text-center text-[13px] text-muted-foreground">
        Send a message to start working with Aevryn.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {plan && hasIntake && (workflowStatus === "draft" || !workflowStatus) ? (
        <PlanDraft
          questions={intakeToQuestions(plan.intake)}
          refining={answerIntakeBusy}
          onAnswers={onAnswerIntake}
          onDiscardPlan={onDiscardPlan}
        />
      ) : plan && (workflowStatus === "draft" || !workflowStatus) ? (
        <FinalizedPlan
          plan={plan}
          progress={planProgress}
          steps={steps}
          runBusy={confirmBusy}
          onRun={onConfirmPlan}
          onDiscardPlan={onDiscardPlan}
        />
      ) : plan ? (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {plan.title || "Plan"}
            </span>
            {" · "}
            {planKindLabel(workflowStatus, steps, planProgress)}
          </p>
          <QaAccordion
            items={buildPlanFallbackItems(plan, planProgress, steps)}
          />
        </div>
      ) : null}
      {messages.length > 0 && <MessageThread messages={messages} />}
      {pending.map((approval) => (
        <div key={approval.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 px-1 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {toolDisplayName(approval.toolName)}
            </span>
            <span>wants to run</span>
            {formatTimeLabel(approval.createdAt) && (
              <span className="text-muted-foreground/60">
                {formatTimeLabel(approval.createdAt)}
              </span>
            )}
          </div>
          {resolveBusy ? (
            <p className="px-1 text-[12px] text-muted-foreground">Resolving…</p>
          ) : (
            <AskUserQuestions
              questions={RESOLVE_QUESTIONS}
              onComplete={(answers) =>
                resolveFromAnswers(answers, onResolveApproval(approval))
              }
            />
          )}
        </div>
      ))}
      {decided.length > 0 && (
        <div className="mt-1 flex flex-col gap-1 px-1">
          {decided.map((approval) => (
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
              {formatTimeLabel(approval.decidedAt) && (
                <span className="text-muted-foreground/60">
                  {formatTimeLabel(approval.decidedAt)}
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
      )}
    </div>
  );
}

function toIsoOrNow(value: string | null | undefined): string {
  return value ?? new Date().toISOString();
}