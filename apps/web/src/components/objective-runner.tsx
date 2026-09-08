"use client";

import { Button } from "@aevryn/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@aevryn/ui/components/card";
import { Skeleton } from "@aevryn/ui/components/skeleton";
import { Textarea } from "@aevryn/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

export function ObjectiveRunner() {
	const [objective, setObjective] = useState(
		"Find the latest information about React.",
	);

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
				<Button
					type="button"
					onClick={() => run.mutate({ objective })}
					disabled={run.isPending || objective.trim().length === 0}
				>
					{run.isPending ? "Running..." : "Run"}
				</Button>
			</CardContent>
			<CardContent className="flex flex-col gap-3">
				{run.isPending ? <Skeleton className="h-24" /> : null}
				{run.data ? (
					<div className="flex flex-col gap-2">
						<p className="whitespace-pre-wrap">{run.data.text}</p>
						{run.data.toolsCalled.length > 0 ? (
							<CardDescription>
								Tools used: {run.data.toolsCalled.join(", ")}
							</CardDescription>
						) : null}
						{run.data.pendingApprovals.length > 0 ? (
							<CardDescription>
								Pending approvals:{" "}
								{run.data.pendingApprovals
									.map((approval) => approval.toolName)
									.join(", ")}
							</CardDescription>
						) : null}
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
