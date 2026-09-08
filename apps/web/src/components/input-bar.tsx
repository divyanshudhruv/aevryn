"use client";

import { Button } from "@aevryn/ui/components/button";
import { Textarea } from "@aevryn/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

const CAP_PRESETS: { label: string; maxChars: number }[] = [
	{ label: "Free", maxChars: 3_000 },
	{ label: "Medium", maxChars: 6_000 },
	{ label: "High", maxChars: 12_000 },
	{ label: "Ultra", maxChars: 24_000 },
	{ label: "God", maxChars: 48_000 },
];

export type RunHandle = {
	workflowId: string;
	executionId: string;
};

export function InputBar({
	onRunStart,
	autoFocus,
	workflowId,
}: {
	onRunStart: (handle: RunHandle) => void;
	autoFocus?: boolean;
	workflowId?: string;
}) {
	const queryClient = useQueryClient();
	const [message, setMessage] = useState("");
	const [capChars, setCapChars] = useState(6_000);

	const send = useMutation({
		...trpc.agent.sendMessage.mutationOptions(),
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: trpc.agent.getThread.queryKey(),
			});
			onRunStart({
				workflowId: data.workflowId,
				executionId: data.executionId,
			});
		},
	});

	const canSubmit = message.trim().length > 0 && !send.isPending;

	const submit = () => {
		if (!canSubmit) return;
		send.mutate({
			message,
			modelContextCapChars: capChars,
			...(workflowId ? { workflowId } : {}),
		});
	};

	return (
		<div className="flex w-full max-w-3xl flex-col gap-2">
			<Textarea
				value={message}
				onChange={(event) => setMessage(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						submit();
					}
				}}
				autoFocus={autoFocus}
				disabled={send.isPending}
				placeholder={
					workflowId
						? "Follow up in this thread… (Enter to run)"
						: "Describe what you want done… (Enter to run)"
				}
				rows={3}
			/>
			<div className="flex items-center gap-2">
				<select
					value={capChars}
					onChange={(event) => setCapChars(Number(event.target.value))}
					disabled={send.isPending}
					className="rounded-md border border-border bg-background px-2 py-1 text-xs"
					aria-label="Context cap"
				>
					{CAP_PRESETS.map((preset) => (
						<option key={preset.maxChars} value={preset.maxChars}>
							Context · {preset.label} · {preset.maxChars.toLocaleString()}{" "}
							chars
						</option>
					))}
				</select>
				<Button
					type="button"
					onClick={submit}
					disabled={!canSubmit}
					className="ml-auto"
				>
					{send.isPending ? "Sending…" : "Send"}
				</Button>
			</div>
			{send.isError ? (
				<p className="text-destructive text-xs">{send.error.message}</p>
			) : null}
		</div>
	);
}
