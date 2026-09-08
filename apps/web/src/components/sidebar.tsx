"use client";

import { Button } from "@aevryn/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, PlusIcon } from "lucide-react";

import { trpc } from "@/utils/trpc";

function statusDot(status: string | null | undefined): string {
	switch (status) {
		case "running":
		case "pending":
			return "bg-primary animate-pulse";
		case "completed":
			return "bg-emerald-500";
		case "failed":
		case "cancelled":
			return "bg-destructive";
		default:
			return "bg-muted-foreground";
	}
}

export function Sidebar({
	activeExecutionId,
	onSelect,
	onNew,
}: {
	activeExecutionId: string | null;
	onSelect: (executionId: string) => void;
	onNew: () => void;
}) {
	const runs = useQuery({
		...trpc.agent.listRuns.queryOptions({ limit: 50 }),
		refetchInterval: 3_000,
	});

	return (
		<aside className="flex w-64 shrink-0 flex-col gap-2 border-border border-r bg-muted/30 p-2">
			<Button
				type="button"
				variant="outline"
				className="justify-start gap-2"
				onClick={onNew}
			>
				<PlusIcon className="size-4" />
				New workflow
			</Button>
			<div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
				{runs.isPending ? (
					<div className="flex items-center gap-2 p-2 text-muted-foreground text-sm">
						<Loader2Icon className="size-3.5 animate-spin" /> Loading…
					</div>
				) : null}
				{runs.data?.length === 0 ? (
					<p className="p-2 text-muted-foreground text-sm">
						No workflows yet. Start one with New workflow.
					</p>
				) : null}
				{runs.data?.map(({ workflow, execution }) => (
					<button
						key={workflow.id}
						type="button"
						onClick={() => execution && onSelect(execution.id)}
						disabled={!execution}
						className={
							"flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left disabled:opacity-50" +
							(activeExecutionId === execution?.id
								? "border-primary/40 bg-accent"
								: "border-transparent hover:bg-muted")
						}
					>
						<span
							className={`size-2 shrink-0 rounded-full ${statusDot(execution?.status)}`}
							aria-hidden
						/>
						<span className="min-w-0 flex-1 truncate text-xs">
							{workflow.objective}
						</span>
						<span className="shrink-0 text-[10px] text-muted-foreground uppercase">
							{execution?.status}
						</span>
					</button>
				))}
			</div>
		</aside>
	);
}
