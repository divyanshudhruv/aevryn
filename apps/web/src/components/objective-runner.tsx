"use client";

import { Button } from "@aevryn/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@aevryn/ui/components/card";
import { Label } from "@aevryn/ui/components/label";
import { Skeleton } from "@aevryn/ui/components/skeleton";
import { Textarea } from "@aevryn/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

const MIN_CAP_CHARS = 1_000;
const MAX_CAP_CHARS = 48_000;
const CHARS_PER_TOKEN = 4;

const CAP_PRESETS: { label: string; maxChars: number }[] = [
	{ label: "Free", maxChars: 3_000 },
	{ label: "Medium", maxChars: 6_000 },
	{ label: "High", maxChars: 12_000 },
	{ label: "Ultra", maxChars: 24_000 },
	{ label: "God", maxChars: 48_000 },
];

function presetFor(capChars: number): string {
	const preset = CAP_PRESETS.reduce(
		(closest, current) =>
			Math.abs(current.maxChars - capChars) <
			Math.abs(closest.maxChars - capChars)
				? current
				: closest,
		CAP_PRESETS[0] as { label: string; maxChars: number },
	);
	return preset.label;
}

export function ObjectiveRunner() {
	const [objective, setObjective] = useState(
		"Find the latest information about React.",
	);
	const [capChars, setCapChars] = useState(6_000);

	const run = useMutation(trpc.agent.runObjective.mutationOptions());

	return (
		<Card className="max-w-2xl">
			<CardHeader>
				<CardTitle>Run an objective</CardTitle>
				<CardDescription>
					The agent plans and executes web capabilities to complete your
					objective.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<Textarea
					value={objective}
					onChange={(event) => setObjective(event.target.value)}
					disabled={run.isPending}
					placeholder="Describe what you want done..."
					rows={3}
				/>
				<div className="flex flex-col gap-2">
					<Label htmlFor="context-cap">Tool output context</Label>
					<input
						id="context-cap"
						type="range"
						min={MIN_CAP_CHARS}
						max={MAX_CAP_CHARS}
						step={500}
						value={capChars}
						onChange={(event) => setCapChars(Number(event.target.value))}
						disabled={run.isPending}
					/>
					<CardDescription>
						{presetFor(capChars)} · {capChars.toLocaleString()} chars per tool
						result (~{Math.round(capChars / CHARS_PER_TOKEN).toLocaleString()}{" "}
						tokens). Full output is still saved in the execution log.
					</CardDescription>
				</div>
				<Button
					type="button"
					onClick={() =>
						run.mutate({ objective, modelContextCapChars: capChars })
					}
					disabled={run.isPending || objective.trim().length === 0}
				>
					{run.isPending ? "Running..." : "Run"}
				</Button>
			</CardContent>
			<CardContent className="flex flex-col gap-3">
				{run.isPending ? <Skeleton className="h-24" /> : null}
				{run.data ? (
					<div className="flex flex-col gap-2">
						<p>
							Objective queued for durable execution. Status:{" "}
							<span className="font-medium">{run.data.status}</span>.
						</p>
						<CardDescription>
							Workflow {run.data.workflowId} · Execution {run.data.executionId}
						</CardDescription>
					</div>
				) : null}
				{run.isError ? (
					<CardDescription className="text-destructive">
						{run.error.message}
					</CardDescription>
				) : null}
			</CardContent>
		</Card>
	);
}
