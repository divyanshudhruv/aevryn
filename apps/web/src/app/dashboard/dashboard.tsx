"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { InputBar, type RunHandle } from "@/components/input-bar";
import { Sidebar } from "@/components/sidebar";
import { ThreadView } from "@/components/thread-view";
import { trpc } from "@/utils/trpc";

export default function Dashboard() {
	const queryClient = useQueryClient();
	const [workflowId, setWorkflowId] = useState<string | null>(null);

	const open = (handle: RunHandle) => {
		setWorkflowId(handle.workflowId);
		queryClient.invalidateQueries({
			queryKey: trpc.agent.listRuns.queryKey(),
		});
	};

	const openNew = () => {
		setWorkflowId(null);
	};

	return (
		<div className="flex h-full min-h-0 gap-4 p-4">
			<Sidebar
				activeWorkflowId={workflowId}
				onSelect={setWorkflowId}
				onNew={openNew}
			/>
			<main className="flex min-w-0 flex-1 flex-col">
				{workflowId ? (
					<div className="flex min-h-0 flex-1 flex-col gap-3">
						<div className="min-h-0 flex-1">
							<ThreadView workflowId={workflowId} />
						</div>
						<div className="shrink-0">
							<InputBar workflowId={workflowId} onRunStart={open} />
						</div>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-4">
						<div className="text-center">
							<p className="text-muted-foreground text-sm">
								Describe what you want done. Aevryn will ask clarifying
								questions, propose a plan, then only run it once you start the
								thread.
							</p>
						</div>
						<InputBar autoFocus onRunStart={open} />
					</div>
				)}
			</main>
		</div>
	);
}
