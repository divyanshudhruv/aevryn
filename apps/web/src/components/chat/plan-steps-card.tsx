"use client";

import { Slider } from "@aevryn/ui/components/ui/slider";

import type { TimelinePlanStep } from "./conversation-timeline";

export function PlanStepsCard({ steps }: { steps: TimelinePlanStep[] }) {
	if (steps.length === 0) return null;

	const currentIdx = steps.findIndex(
		(s) =>
			s.status === "running" ||
			s.status === "retrying" ||
			s.status === "awaiting_approval" ||
			s.status === "failed",
	);
	// Active step (running/failed) wins; otherwise show the last completed
	// step (all done) or step 1 when everything is idle (fresh load, or a
	// re-run just reset the statuses).
	const value =
		currentIdx !== -1
			? currentIdx
			: steps.every((s) => s.status === "completed")
				? steps.length - 1
				: 0;

	return (
		<Slider
			label={steps[value]?.title ?? ""}
			value={value}
			onChange={() => {}}
			min={0}
			max={steps.length - 1}
			formatValue={(v) => String(v + 1)}
			disabled
		/>
	);
}
