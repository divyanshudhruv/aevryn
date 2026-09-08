"use client";

import { Bubble, BubbleContent } from "@aevryn/ui/components/bubble";
import { Button } from "@aevryn/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@aevryn/ui/components/card";
import { Message, MessageContent } from "@aevryn/ui/components/message";
import { Skeleton } from "@aevryn/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CheckCircle2Icon,
	LightbulbIcon,
	Loader2Icon,
	PlayIcon,
	SquareIcon,
	XCircleIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { trpc } from "@/utils/trpc";

const POLL_MS = 1_500;

type LiveTool = {
	tool: string;
	status: "running" | "completed" | "failed";
	durationMs?: number | null;
	summary?: string;
};

function summarizeTool(output: unknown): string | undefined {
	if (!output || typeof output !== "object") {
		return undefined;
	}
	const out = output as Record<string, unknown>;
	if (Array.isArray(out.results) && out.results.length > 0) {
		const first = out.results[0] as Record<string, unknown> | undefined;
		const title =
			typeof first?.title === "string"
				? first.title
				: typeof first?.url === "string"
					? first.url
					: undefined;
		return `${out.results.length} result${out.results.length === 1 ? "" : "s"}${
			title ? ` · ${title}` : ""
		}`;
	}
	if (typeof out.text === "string" && out.text.trim()) {
		return out.text.trim().slice(0, 220);
	}
	const json = JSON.stringify(output);
	return json.length <= 220 ? json : `${json.slice(0, 220)}…`;
}

function ToolChip({ tool, status, durationMs, summary }: LiveTool) {
	return (
		<div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/50 px-2 py-1">
			<div className="flex items-center gap-1.5">
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
			{summary ? (
				<p className="line-clamp-2 max-w-xs text-[11px] text-muted-foreground">
					{summary}
				</p>
			) : null}
		</div>
	);
}

export function ThreadView({ workflowId }: { workflowId: string }) {
	const queryClient = useQueryClient();
	const thread = useQuery({
		...trpc.agent.getThread.queryOptions({ workflowId }),
		refetchInterval: (query) => {
			const active = query.state.data?.turns.some((turn) =>
				["pending", "running"].includes(turn.execution.status),
			);
			return active ? POLL_MS : false;
		},
	});

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: trpc.agent.getThread.queryKey(),
		});
		queryClient.invalidateQueries({ queryKey: trpc.agent.listRuns.queryKey() });
	};

	const confirm = useMutation({
		...trpc.agent.confirmWorkflow.mutationOptions(),
		onSuccess: invalidate,
	});
	const discard = useMutation({
		...trpc.agent.discardPlan.mutationOptions(),
		onSuccess: invalidate,
	});
	const run = useMutation({
		...trpc.agent.runWorkflow.mutationOptions(),
		onSuccess: invalidate,
	});
	const stop = useMutation({
		...trpc.agent.stopWorkflow.mutationOptions(),
		onSuccess: invalidate,
	});

	const data = thread.data;
	const active = data?.turns.some((turn) =>
		["pending", "running"].includes(turn.execution.status),
	);

	const scrollRef = useRef<HTMLDivElement>(null);

	const bodyCount = useMemo(() => {
		if (!data) return 0;
		return (
			data.turns.length +
			data.turns.reduce((n, turn) => n + turn.steps.length, 0)
		);
	}, [data]);

	useEffect(() => {
		if (scrollRef.current && bodyCount > 0) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [bodyCount]);

	if (!data) {
		return (
			<Card className="h-full">
				<CardContent className="flex flex-col gap-2 pt-6">
					<Skeleton className="h-16" />
					<Skeleton className="h-10" />
				</CardContent>
			</Card>
		);
	}

	const isDraft = data.workflow.status === "draft";
	const label = data.workflow.objective;
	const hasPlan = data.plan != null;

	return (
		<Card className="flex h-full min-h-0 flex-col overflow-hidden">
			<CardHeader className="shrink-0">
				<CardTitle className="flex items-center justify-between gap-2">
					<span className="truncate">{label}</span>
					<span className="flex shrink-0 items-center gap-2">
						{isDraft ? (
							<span className="font-medium text-muted-foreground text-xs uppercase">
								draft
							</span>
						) : null}
						{active ? <Loader2Icon className="size-3 animate-spin" /> : null}
						{!isDraft ? (
							<Button
								type="button"
								size="sm"
								disabled={run.isPending}
								onClick={() => run.mutate({ workflowId: data.workflow.id })}
							>
								<PlayIcon className="mr-1 size-3.5" />
								{run.isPending ? "Running…" : "Run"}
							</Button>
						) : null}
						{active ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="text-destructive"
								disabled={stop.isPending}
								onClick={() => stop.mutate({ workflowId: data.workflow.id })}
							>
								<SquareIcon className="mr-1 size-3.5" />
								{stop.isPending ? "Stopping…" : "Stop"}
							</Button>
						) : null}
					</span>
				</CardTitle>
				<CardDescription className="truncate">
					{isDraft
						? "Planning thread — answers clarify the objective. No external work runs yet."
						: data.workflow.status}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col">
				<div
					ref={scrollRef}
					className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
				>
					{data.turns.length === 0 ? (
						<Message align="start">
							<MessageContent>
								<Bubble variant="muted">
									<BubbleContent>No messages yet in this thread.</BubbleContent>
								</Bubble>
							</MessageContent>
						</Message>
					) : null}

					{data.turns.map((turn, turnIndex) => {
						const orderedSteps = [...turn.steps]
							.sort((a, b) => a.order - b.order)
							.filter((step) => step.text?.trim());
						const isLastTurn = turnIndex === data.turns.length - 1;
						const turnFailed = turn.execution.status === "failed";
						const turnStopped = turn.execution.status === "cancelled";
						const isAnswer =
							isLastTurn &&
							turn.execution.status === "completed" &&
							orderedSteps.length > 0;
						const isLiveTurn =
							isLastTurn &&
							active &&
							data.activity?.executionId === turn.execution.id;
						const toolsByOrder = new Map<number, LiveTool>();
						const settledOrders = new Set<number>();
						turn.toolExecutions.forEach((tool) => {
							const order = tool.order;
							settledOrders.add(order);
							toolsByOrder.set(order, {
								tool: tool.tool,
								status: tool.status === "called" ? "running" : tool.status,
								durationMs: tool.durationMs,
								summary: summarizeTool(tool.output),
							});
						});
						if (isLiveTurn && data.activity) {
							data.activity.tools.forEach((tool) => {
								if (!settledOrders.has(tool.order)) {
									toolsByOrder.set(tool.order, {
										tool: tool.tool,
										status: tool.status,
										durationMs: undefined,
									});
								}
							});
						}
						const toolChips = [...toolsByOrder.entries()]
							.sort((a, b) => a[0] - b[0])
							.map(([order, chip]) => (
								<ToolChip key={`tool-${order}`} {...chip} />
							));

						return (
							<div key={turn.execution.id} className="flex flex-col gap-3">
								<Message align="end">
									<MessageContent>
										<Bubble align="end">
											<BubbleContent>{turn.prompt}</BubbleContent>
										</Bubble>
									</MessageContent>
								</Message>

								{toolChips.length > 0 ? (
									<Message align="start">
										<MessageContent>
											<div className="flex min-w-48 max-w-lg flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
												<p className="font-medium text-[10px] text-muted-foreground uppercase">
													Tool calls · {toolChips.length}
												</p>
												<div className="flex flex-col gap-1.5">{toolChips}</div>
											</div>
										</MessageContent>
									</Message>
								) : null}

								{orderedSteps.map((step, stepIndex) => (
									<div key={step.id} className="flex flex-col gap-1.5">
										<Message align="start">
											<MessageContent>
												<Bubble
													variant={
														isAnswer && stepIndex === orderedSteps.length - 1
															? "tinted"
															: "default"
													}
												>
													<BubbleContent>{step.text}</BubbleContent>
												</Bubble>
											</MessageContent>
										</Message>
									</div>
								))}

								{turnFailed ? (
									<Message align="start">
										<MessageContent>
											<Bubble variant="destructive">
												<BubbleContent>
													<XCircleIcon className="mr-1 inline size-3.5" />
													{turn.execution.reason ??
														"This message failed to process."}
												</BubbleContent>
											</Bubble>
										</MessageContent>
									</Message>
								) : null}

								{turnStopped ? (
									<Message align="start">
										<MessageContent>
											<Bubble variant="muted">
												<BubbleContent>
													<SquareIcon className="mr-1 inline size-3.5" />
													Stopped by user
												</BubbleContent>
											</Bubble>
										</MessageContent>
									</Message>
								) : null}
							</div>
						);
					})}

					{active && !hasPlan ? (
						<Message align="start">
							<MessageContent>
								<Bubble variant="muted">
									<BubbleContent>
										<Loader2Icon className="mr-1 inline size-3 animate-spin" />
										{data.activity?.currentActivity ?? "working on it…"}
									</BubbleContent>
								</Bubble>
							</MessageContent>
						</Message>
					) : null}

					{isDraft && hasPlan && data.plan ? (
						<Message align="start">
							<MessageContent>
								<Bubble variant="default" className="w-full min-w-64">
									<BubbleContent className="flex flex-col gap-2">
										<div className="flex items-center gap-2">
											<LightbulbIcon className="size-4 text-primary" />
											<span className="font-medium text-sm">
												{data.plan.title}
											</span>
										</div>
										<p className="text-sm">{data.plan.summary}</p>
										{data.plan.steps && data.plan.steps.length > 0 ? (
											<ul className="list-inside list-disc text-muted-foreground text-xs">
												{data.plan.steps.map((step, index) => (
													<li key={index}>{step}</li>
												))}
											</ul>
										) : null}
										<p className="text-muted-foreground text-xs">
											Objective: {data.plan.objective}
										</p>
										<div className="flex gap-2 pt-1">
											<Button
												type="button"
												size="sm"
												disabled={confirm.isPending}
												onClick={() =>
													confirm.mutate({
														workflowId: data.workflow.id,
													})
												}
											>
												<PlayIcon className="mr-1 size-3.5" />
												{confirm.isPending ? "Binding…" : "Start thread"}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={discard.isPending}
												onClick={() =>
													discard.mutate({
														workflowId: data.workflow.id,
													})
												}
											>
												<XIcon className="mr-1 size-3.5" />
												Cancel
											</Button>
										</div>
										{confirm.error ? (
											<p className="text-destructive text-xs">
												{confirm.error.message}
											</p>
										) : null}
									</BubbleContent>
								</Bubble>
							</MessageContent>
						</Message>
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
