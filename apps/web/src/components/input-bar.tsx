"use client";

import { Button } from "@aevryn/ui/components/button";
import { Textarea } from "@aevryn/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

const CAP_PRESETS: { label: string; maxChars: number }[] = [
	{ label: "Free", maxChars: 3_000 },
	{ label: "Medium", maxChars: 6_000 },
	{ label: "High", maxChars: 12_000 },
	{ label: "Ultra", maxChars: 24_000 },
	{ label: "God", maxChars: 48_000 },
];

export function InputBar({
	onRunStart,
	autoFocus,
}: {
	onRunStart: (executionId: string) => void;
	autoFocus?: boolean;
}) {
	const [objective, setObjective] = useState("");
	const [capChars, setCapChars] = useState(6_000);

	const run = useMutation({
		...trpc.agent.runObjective.mutationOptions(),
		onSuccess: (data) => onRunStart(data.executionId),
	});

	const canSubmit = objective.trim().length > 0 && !run.isPending;

	const submit = () => {
		if (!canSubmit) return;
		run.mutate({ objective, modelContextCapChars: capChars });
	};

	return (
		<div className="flex w-full max-w-3xl flex-col gap-2">
			<Textarea
				value={objective}
				onChange={(event) => setObjective(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						submit();
					}
				}}
				autoFocus={autoFocus}
				disabled={run.isPending}
				placeholder="Describe what you want done… (Enter to run)"
				rows={3}
			/>
			<div className="flex items-center gap-2">
				<select
					value={capChars}
					onChange={(event) => setCapChars(Number(event.target.value))}
					disabled={run.isPending}
					className="rounded-md border border-border bg-background px-2 py-1 text-xs"
					aria-label="Tool output context"
				>
					{CAP_PRESETS.map((preset) => (
						<option key={preset.maxChars} value={preset.maxChars}>
							{preset.label} · {preset.maxChars.toLocaleString()} chars
						</option>
					))}
				</select>
				<Button
					type="button"
					onClick={submit}
					disabled={!canSubmit}
					className="ml-auto"
				>
					{run.isPending ? "Running…" : "Run"}
				</Button>
			</div>
			{run.isError ? (
				<p className="text-destructive text-xs">{run.error.message}</p>
			) : null}
		</div>
	);
}
