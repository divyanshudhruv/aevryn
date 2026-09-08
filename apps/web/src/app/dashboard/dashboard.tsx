"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ExecutionTimeline } from "@/components/execution-timeline";
import { InputBar } from "@/components/input-bar";
import { Sidebar } from "@/components/sidebar";
import { trpc } from "@/utils/trpc";

export default function Dashboard() {
	const queryClient = useQueryClient();
	const [executionId, setExecutionId] = useState<string | null>(null);
	const [isNew, setIsNew] = useState(false);

	const open = (id: string) => {
		setExecutionId(id);
		setIsNew(false);
	};

	const openNew = () => {
		setExecutionId(null);
		setIsNew(true);
	};

	const onRunStart = (id: string) => {
		open(id);
		queryClient.invalidateQueries({ queryKey: trpc.agent.listRuns.queryKey() });
	};

	return (
		<div className="flex h-full min-h-0 gap-4 p-4">
			<Sidebar
				activeExecutionId={executionId}
				onSelect={open}
				onNew={openNew}
			/>
			<main className="flex min-w-0 flex-1 flex-col">
				{isNew ? (
					<div className="flex min-h-0 flex-1 items-center justify-center p-4">
						<InputBar autoFocus onRunStart={onRunStart} />
					</div>
				) : executionId ? (
					<div className="flex min-h-0 flex-1 flex-col gap-3">
						<div className="min-h-0 flex-1">
							<ExecutionTimeline executionId={executionId} />
						</div>
						<div className="shrink-0">
							<InputBar onRunStart={onRunStart} />
						</div>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 items-center justify-center p-4 text-muted-foreground text-sm">
						Select a workflow from the sidebar or start a new one.
					</div>
				)}
			</main>
		</div>
	);
}
