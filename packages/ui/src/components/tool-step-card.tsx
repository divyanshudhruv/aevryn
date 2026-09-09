"use client";

import type { StepCall } from "@aevryn/ui/lib/chat-types";
import type { IconName } from "@aevryn/ui/lib/icon-context";
import { cn } from "@aevryn/ui/lib/utils";
import { ThinkingStepDetails } from "@aevryn/ui/components/ui/thinking-steps";

const TOOL_ICONS: [RegExp, IconName][] = [
  [/search/i, "search"],
  [/scrape|url|http|browser|web|page/i, "globe"],
  [/mail|email|slack|notification/i, "mail"],
  [/wire|action|automate|execute|trigger/i, "settings"],
  [/memory|mem[0o]/i, "brain"],
  [/calendar|schedule|daily|weekly/i, "calendar"],
  [/folder|drive|file/i, "folder"],
];

export function toolIconFor(toolName: string): IconName {
  const match = TOOL_ICONS.find(([re]) => re.test(toolName));
  return match?.[1] ?? "dot";
}

export function toolDisplayName(toolName: string): string {
  if (!toolName) return "tool";
  return toolName
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function summarizeArgs(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "(no args)";
  const [key, value] = entries[0]!;
  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value)?.slice(0, 80) ?? String(value);
  return `${key}: ${text}`;
}

function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function StatusGlyph({ status }: { status: StepCall["status"] }) {
  if (status === "running") {
    return (
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 animate-pulse"
        aria-label="running"
      />
    );
  }
  if (status === "failed") {
    return (
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
        aria-label="failed"
      />
    );
  }
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
      aria-label="done"
    />
  );
}

interface ToolStepCardProps {
  step: StepCall;
  /** 1-based index shown when the same tool runs more than once (nested
   *  sub-step of a thinking step). */
  index?: number;
  className?: string;
}

/** Leaf sub-step for a single tool call — nested under a thinking step when a
 *  tool runs repeatedly, or used directly as the thinking step's detail. */
export function ToolStepCard({ step, index, className }: ToolStepCardProps) {
  const statusLabel =
    step.status === "running"
      ? "running"
      : step.status === "failed"
        ? "error"
        : "done";

  return (
    <div className={cn("flex items-start gap-2 px-2 py-1", className)}>
      <div className="flex h-[18px] items-center pt-[3px]">
        <StatusGlyph status={step.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {index != null && (
            <span className="text-[11px] leading-tight text-muted-foreground/70 tabular-nums">
              {index}
            </span>
          )}
          <span className="truncate text-[12px] leading-tight text-foreground">
            {summarizeArgs(step.input)}
          </span>
          <span
            className={cn(
              "shrink-0 text-[10px] uppercase tracking-wide",
              step.status === "running"
                ? "text-amber-400"
                : step.status === "failed"
                  ? "text-red-500"
                  : "text-emerald-500",
            )}
          >
            {statusLabel}
          </span>
        </div>
        <ThinkingStepDetails
          summary="details"
          className="mt-0"
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Input
              </span>
              <pre className="overflow-x-auto rounded-sm bg-foreground/5 p-2 text-[11px] leading-snug text-foreground">
                {formatJson(step.input)}
              </pre>
            </div>
            {step.output && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  Output
                </span>
                <pre
                  className={cn(
                    "max-h-40 overflow-auto rounded-sm bg-foreground/5 p-2 text-[11px] leading-snug text-foreground",
                    step.status === "failed" && "text-red-400",
                  )}
                >
                  {step.output}
                </pre>
              </div>
            )}
          </div>
        </ThinkingStepDetails>
      </div>
    </div>
  );
}

ToolStepCard.displayName = "ToolStepCard";