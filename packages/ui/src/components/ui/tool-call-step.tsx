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
  ThinkingStepImage,
} from "@aevryn/ui/components/ui/thinking-steps";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aevryn/ui/components/ui/table";
import type { IconName } from "@aevryn/ui/lib/icon-context";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { cn } from "@aevryn/ui/lib/utils";

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
  wireCatalog: { label: "Wire catalog", icon: "database" },
  wireBuildRequests: { label: "Build requests", icon: "database" },
  wireDownload: { label: "Wire file", icon: "folder" },
  aiVisibility: { label: "AI visibility", icon: "star" },
  aiVisibilitySources: { label: "AI sources", icon: "search" },
  aiVisibilitySearches: { label: "AI visibility history", icon: "clock" },
  aiVisibilityRetry: { label: "Retry AI source", icon: "rotate-ccw" },
  browserSessionList: { label: "List sessions", icon: "key" },
  browserSessionCreate: { label: "New session", icon: "key" },
  browserSessionRename: { label: "Rename session", icon: "pencil" },
  browserSessionDelete: { label: "Delete session", icon: "dustbin" },
  storeMemory: { label: "Save memory", icon: "brain" },
  searchMemory: { label: "Search memory", icon: "brain" },
  retryAgent: { label: "Sub-agent retry", icon: "rotate-ccw" },
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
    case "retryAgent": {
      const failed = typeof record.failedStepDescription === "string"
        ? record.failedStepDescription
        : undefined;
      return failed ? truncate(failed, 60) : undefined;
    }
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

// Inline-output budget. Rendered text longer than this collapses into a
// "View output" dropdown instead of stretching the step row.
const OUTPUT_COLLAPSE_THRESHOLD = 250;

// Renders an output as a plain string. Returns the string when it is too
// large to inline (drives the collapsed dropdown); undefined when it fits.
function summarizeOutput(output: unknown): string | undefined {
  if (output == null) return undefined;
  let text: string;
  if (typeof output === "string") {
    text = output;
  } else {
    try {
      text = JSON.stringify(output, null, 2) ?? "null";
    } catch {
      text = String(output);
    }
  }
  return text.length > OUTPUT_COLLAPSE_THRESHOLD ? text : undefined;
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

function extractRetrySubSteps(output: unknown): string[] | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (!Array.isArray(record.subSteps)) return null;
  const items = (record.subSteps as unknown[]).filter(
    (s): s is string => typeof s === "string",
  );
  return items.length > 0 ? items : null;
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

interface SourceLink {
  href: string;
  title?: string;
}

/** Object-shaped { href, text } links from scrape documents. */
function extractLinks(output: unknown): SourceLink[] | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const document =
    record.document != null && typeof record.document === "object"
      ? (record.document as Record<string, unknown>)
      : record;
  if (!Array.isArray(document.links)) return null;
  const links = (document.links as unknown[])
    .map((l) => {
      if (l == null || typeof l !== "object") {
        if (typeof l === "string") return { href: l };
        return null;
      }
      const obj = l as Record<string, unknown>;
      if (typeof obj.href !== "string") return null;
      return {
        href: obj.href,
        title: typeof obj.text === "string" && obj.text ? obj.text : undefined,
      };
    })
    .filter((l): l is SourceLink => l != null)
    .slice(0, 8);
  return links.length > 0 ? links : null;
}

interface ScreenshotRef {
  jobId: string;
  type: "viewport" | "fullpage";
}

/**
 * Key-authed screenshot URLs from scrape documents. The raw URLs are
 * download endpoints (401 without X-API-Key), so the UI renders them through
 * the server-side proxy route instead.
 */
function extractScreenshots(output: unknown): ScreenshotRef[] | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const document =
    record.document != null && typeof record.document === "object"
      ? (record.document as Record<string, unknown>)
      : record;
  const refs: ScreenshotRef[] = [];
  const documentId = typeof document.id === "string" ? document.id : undefined;
  if (documentId) {
    if (typeof document.screenshotUrl === "string") {
      refs.push({ jobId: documentId, type: "viewport" });
    }
    if (typeof document.fullPageScreenshotUrl === "string") {
      refs.push({ jobId: documentId, type: "fullpage" });
    }
  }
  return refs.length > 0 ? refs : null;
}

interface WireFileRef {
  name: string;
  contentType?: string;
  sizeBytes?: number;
}

/** File artifacts from wireAction results — downloadable via the proxy. */
function extractWireFiles(output: unknown): WireFileRef[] | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const result =
    record.result != null && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record;
  if (!Array.isArray(result.files)) return null;
  const files = (result.files as unknown[])
    .map((f) => {
      if (f == null || typeof f !== "object") return null;
      const obj = f as Record<string, unknown>;
      if (typeof obj.name !== "string") return null;
      return {
        name: obj.name,
        contentType: typeof obj.contentType === "string" ? obj.contentType : undefined,
        sizeBytes: typeof obj.sizeBytes === "number" ? obj.sizeBytes : undefined,
      } as WireFileRef;
    })
    .filter((f): f is WireFileRef => f != null);
  return files.length > 0 ? files : null;
}

interface WireJobRef {
  jobId: string;
  file?: string;
}

/** jobId + file name for a wire download proxy URL. */
function wireJobRefOf(output: unknown, file: string): WireJobRef | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const result =
    record.result != null && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record;
  if (typeof result.jobId === "string") return { jobId: result.jobId, file };
  return null;
}

/**
 * Research structured data that looks like an array of uniform row objects
 * renders as a table; anything else stays JSON.
 */
function extractTable(
  output: unknown,
): { columns: string[]; rows: Array<Record<string, unknown>> } | null {
  if (output == null || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const data =
    record.structuredData != null && typeof record.structuredData === "object"
      ? (record.structuredData as Record<string, unknown>)
      : null;
  if (!data) return null;
  for (const value of Object.values(data)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const rows = value.filter(
      (r): r is Record<string, unknown> =>
        r != null && typeof r === "object" && !Array.isArray(r),
    );
    if (rows.length < 2) continue;
    const columns = [
      ...new Set(
        rows.flatMap((r) =>
          Object.keys(r).filter(
            (k) => typeof r[k] != null && typeof r[k] !== "object",
          ),
        ),
      ),
    ].slice(0, 6);
    if (columns.length === 0) continue;
    return { columns, rows: rows.slice(0, 12) };
  }
  return null;
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
  const links = extractLinks(output);
  const screenshots = extractScreenshots(output);
  const wireFiles = extractWireFiles(output);
  const table = extractTable(output);
  const details: string[] = subSteps?.map((s) => s.label) ?? [];

  // retryAgent outcome: the corrected result text with a sub-step trail.
  const retrySteps = extractRetrySubSteps(output);
  if (retrySteps) {
    const resultText =
      output != null && typeof output === "object"
        ? (output as Record<string, unknown>).resultText
        : undefined;
    const text =
      typeof resultText === "string" && resultText.trim().length > 0
        ? resultText.trim()
        : undefined;
    return (
      <div className="mt-1 flex flex-col gap-1.5">
        {text && (
          <p className="whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">
            {truncate(text, 400)}
          </p>
        )}
        <ThinkingStepDetails
          summary={`${retrySteps.length} sub-step${retrySteps.length === 1 ? "" : "s"}`}
          details={retrySteps}
        >
          {retrySteps.map((s, i) => (
            <span key={i} className="text-[11px] text-muted-foreground">
              {s}
            </span>
          ))}
        </ThinkingStepDetails>
      </div>
    );
  }

  if (
    details.length === 0 &&
    sources == null &&
    links == null &&
    screenshots == null &&
    wireFiles == null &&
    table == null
  ) {
    // Generic output: inline when it fits, collapsible "View output" when big.
    // Table-able or media-bearing outputs skip this path — their renderers
    // truncate per cell instead.
    let json: string;
    try {
      json = typeof output === "string" ? output : JSON.stringify(output, null, 2) ?? "null";
    } catch {
      json = String(output);
    }
    if (json === "null" || json === "undefined") return null;
    const pre = (
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">
        {json}
      </pre>
    );
    if (summarizeOutput(output) == null) return pre;
    return (
      <ThinkingStepDetails summary="View output">
        {pre}
      </ThinkingStepDetails>
    );
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
      {table && <OutputTable columns={table.columns} rows={table.rows} />}
      {screenshots && screenshots.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {screenshots.map((shot) => (
            <ThinkingStepImage
              key={shot.type}
              src={`/api/anakin/screenshot/${encodeURIComponent(shot.jobId)}?type=${shot.type}`}
              alt={`Page screenshot (${shot.type})`}
              caption={shot.type === "fullpage" ? "Full page" : "Viewport"}
            />
          ))}
        </div>
      )}
      {wireFiles && wireFiles.length > 0 && <WireFileChips output={output} files={wireFiles} />}
      {sources && (
        <ThinkingStepSources>
          {sources.map((source, i) => (
            <ThinkingStepSource key={i} delay={i * 0.05}>
              {source}
            </ThinkingStepSource>
          ))}
        </ThinkingStepSources>
      )}
      {links && (
        <ThinkingStepSources>
          {links.map((link, i) => (
            <ThinkingStepSource key={`${link.href}-${i}`} delay={i * 0.05}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
                title={link.title ?? link.href}
              >
                {link.title ?? stripScheme(link.href)}
              </a>
            </ThinkingStepSource>
          ))}
        </ThinkingStepSources>
      )}
    </>
  );
}

function OutputTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <div className="mt-1.5 max-h-60 overflow-auto">
      <Table size="compact">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c} className="max-w-48 truncate">
                  {String(row[c] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WireFileChips({
  output,
  files,
}: {
  output: unknown;
  files: WireFileRef[];
}) {
  const Download = useIcon("arrowdownfromline");
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((file) => {
        const ref = wireJobRefOf(output, file.name);
        const href = ref
          ? `/api/anakin/wire-download/${encodeURIComponent(ref.jobId)}?file=${encodeURIComponent(file.name)}`
          : undefined;
        const label = [
          file.name,
          file.sizeBytes != null
            ? `${(file.sizeBytes / 1024).toFixed(0)} KB`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
        return href ? (
          <a
            key={file.name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
            title={`Download ${file.name}`}
          >
            <Download size={12} strokeWidth={1.75} />
            {label}
          </a>
        ) : (
          <span
            key={file.name}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            {label}
          </span>
        );
      })}
    </div>
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
      <ThinkingSteps open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
        <ThinkingStepsHeader>{label}</ThinkingStepsHeader>
        <ThinkingStepsContent>
          <ToolStepLine call={call} isLast />
        </ThinkingStepsContent>
      </ThinkingSteps>
    );
  }

  return (
    <ThinkingSteps open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      <ThinkingStepsHeader>{label}</ThinkingStepsHeader>
      <ThinkingStepsContent>
        <ToolStepLine call={call} isLast />
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}

/** One inner line of a step card — shared by the single ToolCallStep and the
 *  grouped ToolCallSequence. Running calls get the active shimmer; failures
 *  swap to an error icon and message. */
function ToolStepLine({
  call,
  isLast,
}: {
  call: ToolCallStepSegment;
  isLast: boolean;
}) {
  const meta = metaFor(call.toolName);
  const summary = summarizeInput(call.toolName, call.input);
  const label = [meta.label, summary].filter(Boolean).join(" · ") || meta.label;

  if (call.isRunning) {
    return (
      <ThinkingStep
        icon={meta.icon}
        label={label}
        description="Running…"
        status="active"
        isLast={isLast}
      />
    );
  }

  const hasError = call.isError || outputHasError(call.output);
  return (
    <ThinkingStep
      icon={hasError ? "x" : meta.icon}
      label={hasError ? `${label} — failed` : label}
      description={hasError ? errorDetail(call.output) : undefined}
      isLast={isLast}
    >
      {call.output != null && !hasError && <OutputDetails output={call.output} />}
    </ThinkingStep>
  );
}

// ─── ToolCallSequence (one card, many steps) ────────────────────────────────
//
// Groups every tool call of a single assistant turn into ONE expandable card
// with one inner step per call, so a run reads as a mini pipeline (search →
// scrape → … → final answer) instead of a stack of standalone cards. The
// header is whatever the model itself wrote leading into the calls — no
// hardcoded agent names.

export interface ToolCallStepSegment {
  toolCallId?: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  isRunning: boolean;
  isError?: boolean;
}

export interface ToolCallSequenceProps {
  /** AI-authored title for the whole card. When empty, falls back to the
   *  first step's tool label. */
  title?: string;
  /** Tool-call segments in chronological order. */
  steps: ToolCallStepSegment[];
  /** Render the trailing "Final answer" step (default true). */
  answerStep?: boolean;
  /** Keep the "Final answer" step shimmering while the answer streams. */
  answerRunning?: boolean;
  className?: string;
}

export function ToolCallSequence({
  title,
  steps,
  answerStep = true,
  answerRunning = false,
  className,
}: ToolCallSequenceProps) {
  const [open, setOpen] = useState(true);

  const first = steps[0];
  const headline =
    title != null && title.trim()
      ? title.trim()
      : first
        ? metaFor(first.toolName).label + (first.isRunning ? "…" : "")
        : "Tools";

  return (
    <ThinkingSteps open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      <ThinkingStepsHeader>{headline}</ThinkingStepsHeader>
      <ThinkingStepsContent>
        {steps.map((call, i) => (
          <ToolStepLine
            key={call.toolCallId ?? `${i}`}
            call={call}
            isLast={i === steps.length - 1 && !answerStep}
          />
        ))}
        {answerStep && (
          <ThinkingStep
            icon="check"
            label="Final answer"
            status={answerRunning ? "active" : "complete"}
            isLast
          />
        )}
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}

export default ToolCallStep;
