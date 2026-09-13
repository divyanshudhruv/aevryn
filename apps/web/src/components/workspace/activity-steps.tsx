"use client";

import { useState } from "react";
import {
	ThinkingSteps,
	ThinkingStepsHeader,
	ThinkingStepsContent,
	ThinkingStep,
	ThinkingStepDetails,
	ThinkingStepSource,
	ThinkingStepSources,
} from "@aevryn/ui/components/ui/thinking-steps";
import type { IconName } from "@aevryn/ui/lib/icon-context";

export interface ActivityStep {
	id: string;
	type: string;
	status: string;
	stepLabel: string | null;
	title: string | null;
	description: string | null;
	detail?: unknown;
	createdAt: string;
}

/** Extract URLs mentioned in a tool's input for the source chips. */
function sourcesFor(step: ActivityStep): string[] {
	const detail = (step.detail ?? {}) as { input?: Record<string, unknown> };
	const input = detail.input ?? {};
	const urls: string[] = [];
	const push = (v: unknown) => {
		if (typeof v === "string" && /^https?:\/\//.test(v)) {
			try {
				urls.push(new URL(v).hostname);
			} catch {
				urls.push(v);
			}
		}
	};
	if (typeof input.url === "string") push(input.url);
	if (typeof input.query === "string") return [input.query];
	if (typeof input.topic === "string") return [input.topic];
	if (Array.isArray(input.urls)) input.urls.forEach(push);
	if (urls.length === 0 && typeof input.url === "string") urls.push(input.url);
	return urls;
}

/** Human detail lines derived from a completed tool's output. */
function detailsFor(step: ActivityStep): string[] {
	const detail = (step.detail ?? {}) as {
		input?: Record<string, unknown>;
		output?: Record<string, unknown> | null;
		error?: { message?: string } | null;
	};
	if (step.status === "failed") {
		return [detail.error?.message ?? "Failed"];
	}
	const output = detail.output;
	if (!output || typeof output !== "object") return [];
	const tool = step.stepLabel ?? "";
	const lines: string[] = [];
	// Common result shapes across capabilities.
	if (typeof output.title === "string") lines.push(output.title);
	if (typeof output.summary === "string") lines.push(output.summary);
	if (Array.isArray(output.results)) {
		for (const r of (output.results as Array<Record<string, unknown>>).slice(0, 5)) {
			if (typeof r?.title === "string") lines.push(r.title);
			else if (typeof r?.url === "string") lines.push(r.url);
		}
	}
	if (typeof output.content === "string") {
		lines.push(`${output.content.length.toLocaleString()} chars read`);
	}
	if (typeof output.count === "number") lines.push(`${output.count} items`);
	if (lines.length === 0 && Object.keys(output).length > 0) {
		lines.push(`${tool}: done`);
	}
	return lines.slice(0, 6);
}

const iconByTool: Record<string, IconName> = {
	searchWeb: "search",
	scrapeUrl: "globe",
	crawlSite: "globe",
	mapSite: "globe",
	researchTopic: "brain",
	wireAction: "settings",
	createSchedule: "clock",
	storeMemory: "brain",
	searchMemory: "brain",
	browserSessionCreate: "play",
	browserSessionDelete: "stop",
	browserSessionRename: "pencil",
	browserSessionList: "search",
};

function iconFor(step: ActivityStep): IconName {
	if (step.type === "tool") return iconByTool[step.stepLabel ?? ""] ?? "globe";
	if (step.type === "thinking") return "brain";
	if (step.type === "system") return "dot";
	return "dot";
}

function statusFor(step: ActivityStep): "complete" | "active" | "pending" {
	if (step.status === "running" || step.status === "pending") return "active";
	return "complete";
}

function labelFor(step: ActivityStep): string {
	return step.title ?? step.stepLabel ?? step.type;
}

/**
 * The live run trace, mirroring old-workspace's ThinkingSteps presentation:
 * per-tool steps with icons, source chips (queries/URLs), and expandable
 * "Read x" details from the tool output. Renders incrementally — the page
 * refetches the read model on realtime activity changes, so steps appear
 * while the agent works (status "active"), not after completion.
 */
export function ToolStepList({ activities }: { activities: ActivityStep[] }) {
	const [open, setOpen] = useState(true);

	const trace = activities.filter(
		(a) => a.type === "tool" || a.type === "thinking",
	);
	if (trace.length === 0) return null;

	return (
		<ThinkingSteps open={open} onOpenChange={setOpen}>
			<ThinkingStepsHeader>Agent trace</ThinkingStepsHeader>
			<ThinkingStepsContent>
				{trace.map((step, i) => {
					const sources = sourcesFor(step);
					const details = detailsFor(step);
					return (
						<ThinkingStep
							key={step.id}
							icon={iconFor(step)}
							label={labelFor(step)}
							status={statusFor(step)}
							isLast={i === trace.length - 1}
						>
							{sources.length > 0 && (
								<ThinkingStepSources>
									{sources.map((s) => (
										<ThinkingStepSource key={s}>{s}</ThinkingStepSource>
									))}
								</ThinkingStepSources>
							)}
							{details.length > 0 && (
								<ThinkingStepDetails
									summary={
										step.status === "failed" ? "Failed" : "Details"
									}
									details={details}
								/>
							)}
						</ThinkingStep>
					);
				})}
			</ThinkingStepsContent>
		</ThinkingSteps>
	);
}
