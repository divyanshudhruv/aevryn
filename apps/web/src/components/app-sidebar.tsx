"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import { useThreadStore } from "@/stores/thread-store";
import type { Thread } from "@/stores/thread-store";
import {
	AppSidebar as PresetSidebar,
	type SidebarThreadItem,
} from "@aevryn/ui/components/sidebar-preset/app-sidebar";

type ExecutionStatus =
	| "pending"
	| "running"
	| "sleeping"
	| "waiting"
	| "awaiting_approval"
	| "completed"
	| "failed"
	| "cancelled";

type WorkflowStatus =
	| "draft"
	| "active"
	| "paused"
	| "sleeping"
	| "waiting"
	| "awaiting_approval"
	| "completed"
	| "cancelled"
	| "failed";

function workflowToExecutionStatus(status: WorkflowStatus): ExecutionStatus {
	switch (status) {
		case "draft":
			return "pending";
		case "active":
			return "running";
		case "paused":
			return "pending";
		case "sleeping":
			return "sleeping";
		case "waiting":
			return "waiting";
		case "awaiting_approval":
			return "awaiting_approval";
		case "completed":
			return "completed";
		case "cancelled":
			return "cancelled";
		case "failed":
			return "failed";
	}
}

export function AppSidebar() {
	const router = useRouter();
	const pathname = usePathname();
	const { setThreads, setActiveThread } = useThreadStore();

	const { data } = useQuery(trpc.agent.listRuns.queryOptions({ limit: 50 }));

	const threadIdFromPath =
		pathname.startsWith("/workspace/") ? pathname.split("/")[2] : null;

	useEffect(() => {
		if (!data) return;
		const threads: Thread[] = data.map((run) => ({
			id: run.workflow.id,
			objective: run.workflow.objective ?? "Untitled thread",
			status: run.execution?.status ?? run.workflow.status,
			createdAt: run.workflow.createdAt,
		}));
		setThreads(threads);
	}, [data, setThreads]);

	useEffect(() => {
		setActiveThread(threadIdFromPath);
	}, [threadIdFromPath, setActiveThread]);

	const items: SidebarThreadItem[] = (data ?? []).map((run) => ({
		id: run.workflow.id,
		label: run.workflow.objective ?? "Untitled thread",
		status: run.execution?.status ?? workflowToExecutionStatus(run.workflow.status),
	}));

	return (
		<PresetSidebar
			threads={items}
			activeThreadId={threadIdFromPath}
			onNavigate={(id) => {
				setActiveThread(id);
				router.push(`/workspace/${id}`);
			}}
			onNewThread={() => {
				setActiveThread(null);
				router.push("/workspace");
			}}
		/>
	);
}