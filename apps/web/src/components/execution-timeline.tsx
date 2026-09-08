"use client";

import { Bubble, BubbleContent } from "@aevryn/ui/components/bubble";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@aevryn/ui/components/card";
import { Message, MessageContent } from "@aevryn/ui/components/message";
import { Skeleton } from "@aevryn/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, Loader2Icon, XCircleIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { trpc } from "@/utils/trpc";

const POLL_MS = 1_500;

type LiveTool = {
	tool: string;
	status: "running" | "completed" | "failed";
	durationMs?: number | null;
};

function ToolChip({ tool, status, durationMs }: LiveTool) {
	return (
		<div className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1">
			{status === "completed" ? (
				<CheckCircle2Icon className="size-3.5 text-emerald-500" />
			) : status === "failed" ? (
				<XCircleIcon className="size-3.5 text-destructive" />
			) : (
				<Loader2Icon className="size-3.5 animate-spin text-primary" />
			)}
			<span className="font-medium text-xs">{tool}</span>
			{durationMs != null && Number.isFinite(durationMs) ? (
				<span className="text-muted-foreground">
					· {Math.round(durationMs)}ms
				</span>
			) : null}
		</div>
	);
}

export function ExecutionTimeline({ executionId }: { executionId: string }) {
	const run = useQuery({
		...trpc.agent.getRun.queryOptions({ executionId }),
		refetchInterval: (query) =>
			query.state.data?.execution.status === "pending" ||
			query.state.data?.execution.status === "running"
				? POLL_MS
				: false,
	}).data;

	const active =
		run?.execution.status === "pending" || run?.execution.status === "running";

	const scrollRef = useRef<HTMLDivElement>(null);

	const entries = useMemo(() => {
		if (!run) {
			return [];
		}
		const persistedSteps = [...run.steps].sort((a, b) => a.order - b.order);
		const liveSteps = run.activity?.steps ?? [];
		const liveTools = run.activity?.tools ?? [];
		const showLive = persistedSteps.length === 0 && liveSteps.length > 0;

		const result: Array<
			| { key: string; kind: "text"; text: string; answer?: boolean }
			| { key: string; kind: "tools"; tools: LiveTool[] }
		> = [];

		if (showLive) {
			const coveredSteps = new Set(liveSteps.map((step) => step.order));
			liveSteps.forEach((step) => {
				result.push({
					key: `t-${step.order}`,
					kind: "text",
					text: step.text,
				});
				const stepTools: LiveTool[] = liveTools
					.filter((tool) => tool.step === step.order)
					.map((tool) => ({
						tool: tool.tool,
						status: tool.status,
					}));
				if (stepTools.length > 0) {
					result.push({
						key: `tl-${step.order}`,
						kind: "tools",
						tools: stepTools,
					});
				}
			});
			const pendingTools: LiveTool[] = liveTools.filter(
				(tool) => tool.status === "running" && !coveredSteps.has(tool.step),
			);
			if (pendingTools.length > 0) {
				result.push({ key: "pending", kind: "tools", tools: pendingTools });
			}
		} else {
			persistedSteps.forEach((step) => {
				if (step.text?.trim()) {
					const isFinal =
						run.execution.status === "completed" &&
						step.order === persistedSteps[persistedSteps.length - 1]?.order;
					result.push({
						key: `t-${step.order}`,
						kind: "text",
						text: step.text,
						answer: isFinal,
					});
				}
				const stepTools: LiveTool[] = run.toolExecutions
					.filter((tool) => tool.stepId === step.id)
					.map((tool) => ({
						tool: tool.tool,
						status: tool.status === "called" ? "running" : tool.status,
						durationMs: tool.durationMs,
					}));
				if (stepTools.length > 0) {
					result.push({
						key: `tl-${step.order}`,
						kind: "tools",
						tools: stepTools,
					});
				}
			});
		}
		return result;
	}, [run]);

	const lastEntryCount = entries.length;

	useEffect(() => {
		if (scrollRef.current && lastEntryCount > 0) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [lastEntryCount]);

	if (!run) {
		return (
			<Card className="h-full">
				<CardContent className="flex flex-col gap-2 pt-6">
					<Skeleton className="h-16" />
					<Skeleton className="h-10" />
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="flex h-full min-h-0 flex-col overflow-hidden">
			<CardHeader className="shrink-0">
				<CardTitle className="flex items-center justify-between gap-2">
					<span className="truncate">{run.workflow.objective}</span>
					<span className="shrink-0 font-medium text-muted-foreground text-sm capitalize">
						{run.execution.status}
						{active ? (
							<Loader2Icon className="ml-1 inline size-3 animate-spin" />
						) : null}
					</span>
				</CardTitle>
				<CardDescription className="truncate">
					Execution {run.execution.id}
					{run.execution.reason ? ` · ${run.execution.reason}` : ""}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col">
				<div
					ref={scrollRef}
					className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
				>
					<Message align="end">
						<MessageContent>
							<Bubble align="end">
								<BubbleContent>{run.workflow.objective}</BubbleContent>
							</Bubble>
						</MessageContent>
					</Message>

					{entries.map((entry) =>
						entry.kind === "text" ? (
							<Message key={entry.key} align="start">
								<MessageContent>
									<Bubble variant={entry.answer ? "tinted" : "default"}>
										<BubbleContent>{entry.text}</BubbleContent>
									</Bubble>
								</MessageContent>
							</Message>
						) : (
							<div key={entry.key} className="flex flex-wrap gap-1.5">
								{entry.tools.map((tool, index) => (
									<ToolChip key={`${entry.key}-${index}`} {...tool} />
								))}
							</div>
						),
					)}

					{active ? (
						<Message align="start">
							<MessageContent>
								<Bubble variant="muted">
									<BubbleContent>
										<Loader2Icon className="mr-1 inline size-3 animate-spin" />
										{run.activity?.currentActivity ?? "working on it…"}
									</BubbleContent>
								</Bubble>
							</MessageContent>
						</Message>
					) : null}

					{!active && run.activity?.status === "failed" ? (
						<p className="text-destructive text-xs">
							The agent could not complete this objective.
						</p>
					) : null}
				</div>
				{active ? (
					<p className="mt-2 text-right text-[11px] text-muted-foreground">
						live — refetching every {POLL_MS / 1000}s
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
