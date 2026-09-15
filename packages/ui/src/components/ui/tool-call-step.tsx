"use client";

import { useState } from "react";

import {
  ThinkingSteps,
  ThinkingStepsHeader,
  ThinkingStepsContent,
  ThinkingStep,
  ThinkingStepDetails,
  ThinkingStepSources,
  ThinkingStepSource,
} from "@aevryn/ui/components/ui/thinking-steps";
import { ThinkingIndicator } from "@aevryn/ui/components/ui/thinking-indicator";
import type { IconName } from "@aevryn/ui/lib/icon-context";

// ─── Shared shapes ──────────────────────────────────────────────────────────

export interface ToolCallView {
  toolCallId: string;
  toolName: string;
    input: unknown;
    output?: unknown;
    isRunning: boolean;
    isError?: boolean;
}

// ─── Per-tool display metadata ──────────────────────────────────────────────

interface ToolMeta {
  label: string;
  icon: IconName;
}

const TOOL_META: Record<string, ToolMeta> = {
  searchWeb: { label: "Web search", icon: "search" },
  scrapeUrl: { label: "Scrape page", icon: "globe" },
  scrapeBatch: { label: "Batch scrape", icon: "globe" },
  crawlSite: { label: "Crawl site", icon: "database" },
  mapSite: { label: "Map site", icon: "globe" },
  researchTopic: { label: "Deep research", icon: "lightbulb" },
  wireDiscover: { label: "Discover actions", icon: "search" },
  wireAction: { label: "Run action", icon: "play" },
  wireBuildRequest: { label: "Request new action", icon: "plus" },
  aiVisibility: { label: "AI visibility", icon: "star" },
  browserSessionList: { label: "List sessions", icon: "key" },
  browserSessionCreate: { label: "New session", icon: "key" },
  browserSessionRename: { label: "Rename session", icon: "pencil" },
  browserSessionDelete: { label: "Delete session", icon: "dustbin" },
  storeMemory: { label: "Save memory", icon: "brain" },
  searchMemory: { label: "Search memory", icon: "brain" },
  updateStepStatus: { label: "Update step", icon: "check" },
};

const FALLBACK_META: ToolMeta = { label: "Tool", icon: "loader" };

function metaFor(toolName: string): ToolMeta {
  return TOOL_META[toolName] ?? FALLBACK_META;
}

// ─── Input/output summaries ─────────────────────────────────────────────────

function summarizeInput(toolName: string, input: unknown): string | undefined {
  if (input == null || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;

  const url = typeof record.url === "string" ? record.url : undefined;
  const siteUrl = typeof record.siteUrl === "string" ? record.siteUrl : undefined;
  const prompt = typeof record.prompt === "string" ? record.prompt : undefined;
  const query = typeof record.query === "string" ? record.query : undefined;
  const actionId = typeof record.actionId === "string" ? record.actionId : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const text = typeof record.text === "string" ? record.text : undefined;

  switch (toolName) {
    case "searchWeb":
    case "researchTopic":
      return truncate(prompt, 70);
    case "scrapeUrl":
    case "crawlSite":
    case "mapSite":
      return url ? truncate(stripScheme(url), 60) : undefined;
    case "scrapeBatch": {
      const urls = Array.isArray(record.urls) ? record.urls.length : undefined;
      return urls != null ? `${urls} page${urls === 1 ? "" : "s"}` : undefined;
    }
    case "wireDiscover":
      return query ? truncate(query, 60) : undefined;
    case "wireAction":
    case "wireBuildRequest":
      return actionId ?? (siteUrl ? truncate(stripScheme(siteUrl), 50) : undefined);
    case "aiVisibility":
      return truncate(query, 70);
    case "browserSessionCreate":
    case "browserSessionRename":
      return name;
    case "storeMemory":
      return truncate(text, 70);
    case "searchMemory":
      return truncate(query, 70);
    default:
      return undefined;
  }
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function extractSubSteps(
  output: unknown,
): Array<{ label: string; failed?: boolean }> | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;

  const pickArray = (key: string): unknown[] | null =>
    Array.isArray(record[key]) ? (record[key] as unknown[]) : null;

  const candidates = pickArray("documents") ?? pickArray("pages") ?? pickArray("results");
  if (candidates && candidates.length > 0) {
    return candidates
      .slice(0, 20)
      .map((entry) => {
        if (entry != null && typeof entry === "object") {
          const item = entry as Record<string, unknown>;
          const label =
            (typeof item.url === "string" && truncate(stripScheme(item.url), 56)) ||
            (typeof item.source === "string" && item.source) ||
            (typeof item.title === "string" && truncate(item.title, 56)) ||
            "item";
          const failed = item.status === "failed" || item.status === "timed_out";
          return { label, failed };
        }
        return { label: String(entry) };
      });
  }

  if (Array.isArray(record.links) && record.links.length > 0) {
    return (record.links as unknown[])
      .slice(0, 20)
      .map((link) => ({
        label: typeof link === "string" ? truncate(stripScheme(link), 56) ?? "link" : "link",
      }));
  }

  return null;
}

function extractSources(output: unknown): string[] | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.results)) return null;
  const urls = (record.results as unknown[])
    .map((r) =>
      r != null && typeof r === "object" && typeof (r as Record<string, unknown>).url === "string"
        ? ((r as Record<string, unknown>).url as string)
        : null,
    )
    .filter((u): u is string => Boolean(u))
    .slice(0, 8);
  return urls.length > 0 ? urls.map(stripScheme) : null;
}

function outputHasError(output: unknown): boolean {
  if (output == null || typeof output !== "object") return false;
  const record = output as Record<string, unknown>;
  if (record.ok === false) return true;
  const error = record.error;
  if (error != null && typeof error === "object" && typeof (error as Record<string, unknown>).code === "string") {
    return true;
  }
  return false;
}

function errorDetail(output: unknown): string | undefined {
  if (output == null || typeof output !== "object") return undefined;
  const record = output as Record<string, unknown>;
  const error = record.error;
  if (error != null && typeof error === "object") {
    const err = error as Record<string, unknown>;
    if (typeof err.message === "string") return err.message;
  }
  if (typeof record.error === "string") return record.error;
  return undefined;
}

// ─── Output detail (nested collapsible) ─────────────────────────────────────

function OutputDetails({ output }: { output: unknown }) {
  const subSteps = extractSubSteps(output);
  const sources = extractSources(output);
  const details: string[] = subSteps?.map((s) => s.label) ?? [];

  if (details.length === 0 && sources == null) {
    // Generic output: pretty JSON, truncated.
    let json: string;
    try {
      json = JSON.stringify(output, null, 2) ?? "null";
    } catch {
      json = String(output);
    }
    if (json.length > 400) json = `${json.slice(0, 400)}…`;
    if (json === "null" || json === "undefined") return null;
    return <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">{json}</pre>;
  }

  return (
    <>
      {subSteps && (
        <ThinkingStepDetails
          summary={`${subSteps.length} item${subSteps.length === 1 ? "" : "s"}`}
          details={details}
        >
          {subSteps
            .filter((s) => s.failed)
            .map((s, i) => (
              <span key={i} className="text-[11px] text-red-600 dark:text-red-400">
                failed · {s.label}
              </span>
            ))}
        </ThinkingStepDetails>
      )}
      {sources && (
        <ThinkingStepSources>
          {sources.map((source, i) => (
            <ThinkingStepSource key={i} delay={i * 0.05}>
              {source}
            </ThinkingStepSource>
          ))}
        </ThinkingStepSources>
      )}
    </>
  );
}

// ─── ToolCallStep ───────────────────────────────────────────────────────────

export interface ToolCallStepProps {
  call: ToolCallView;
  className?: string;
}

export function ToolCallStep({ call, className }: ToolCallStepProps) {
  const [open, setOpen] = useState(true);
  const meta = metaFor(call.toolName);
  const summary = summarizeInput(call.toolName, call.input);
  const label = [meta.label, summary].filter(Boolean).join(" · ");

  if (call.isRunning) {
    return (
      <div className={className}>
        <ThinkingIndicator
          words={[
            meta.label,
            "Working",
            "Fetching",
            "Analyzing",
          ]}
          showIcon
          size="compact"
        />
      </div>
    );
  }

  const hasError = call.isError || outputHasError(call.output);
  const detail = hasError ? errorDetail(call.output) : undefined;
  const stepIcon: IconName = hasError ? "x" : meta.icon;

  return (
    <ThinkingSteps open={open} onOpenChange={setOpen} className={className}>
      <ThinkingStepsHeader>{label}</ThinkingStepsHeader>
      <ThinkingStepsContent>
        <ThinkingStep
          icon={stepIcon}
          label={hasError ? "Failed" : "Completed"}
          description={detail}
          isLast={!call.output}
        >
          {call.output != null && !hasError && <OutputDetails output={call.output} />}
        </ThinkingStep>
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}

export default ToolCallStep;
