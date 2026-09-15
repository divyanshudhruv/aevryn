"use client";

import { useIcon, type IconName } from "@aevryn/ui/lib/icon-context";
import { cn } from "@aevryn/ui/lib/utils";

import type { TimelinePlanStep } from "./conversation-timeline";

function statusIcon(status: string): IconName {
	if (status === "completed") return "check";
	if (status === "failed") return "x";
	if (status === "running") return "play";
	return "dot";
}

function statusColor(status: string): string {
	if (status === "completed") return "text-emerald-600 dark:text-emerald-400";
	if (status === "failed") return "text-red-600 dark:text-red-400";
	if (status === "running") return "text-foreground";
	return "text-muted-foreground";
}

const statusLabel: Record<string, string> = {
	idle: "Pending",
	running: "Running",
	awaiting_approval: "Awaiting approval",
	completed: "Done",
	failed: "Failed",
	sleeping: "Paused",
};

export function PlanStepsCard({ steps }: { steps: TimelinePlanStep[] }) {
	const Check = useIcon("check");
	const X = useIcon("x");
	const Play = useIcon("play");
	const Dot = useIcon("dot");

	const iconFor = (status: string) => {
		switch (status) {
			case "completed":
				return Check;
			case "failed":
				return X;
			case "running":
				return Play;
			default:
				return Dot;
		}
	};

	const done = steps.filter((s) => s.status === "completed").length;
	const active = steps.filter((s) => s.status === "running").length;

	if (steps.length === 0) return null;

	return (
		<div className="rounded-xl border bg-background/60 px-4 py-3">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Plan
				</span>
				<span className="text-[11px] tabular-nums text-muted-foreground">
					{done}/{steps.length} done{active > 0 ? " · running" : ""}
				</span>
			</div>
			<ol className="flex flex-col gap-1.5">
				{steps.map((step) => {
					const Icon = iconFor(step.status);
					return (
						<li key={step.id} className="flex items-start gap-2 text-sm">
							<span
								className={cn(
									"mt-0.5 flex size-4 shrink-0 items-center justify-center",
									statusColor(step.status),
								)}
							>
								<Icon size={13} strokeWidth={2} />
							</span>
							<span
								className={cn(
									"min-w-0 flex-1",
									step.status === "completed" &&
										"text-muted-foreground line-through decoration-muted-foreground/40",
									step.status === "running" && "font-medium",
								)}
							>
								{step.title}
							</span>
							<span className="shrink-0 text-[11px] text-muted-foreground">
								{statusLabel[step.status] ?? step.status}
							</span>
						</li>
					);
				})}
			</ol>
		</div>
	);
}
