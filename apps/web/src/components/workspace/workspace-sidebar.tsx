"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Route } from "next";
import {
	AppSidebar,
	type SidebarData,
} from "@aevryn/ui/components/sidebar-preset/app-sidebar";
import { supabaseClient } from "@/lib/supabase-client";
import { subscribeToRealtime } from "@/lib/realtime-channel";

export function WorkspaceSidebar() {
	const params = useParams<{ workspaceId?: string; threadId?: string }>();
	const router = useRouter();
	const [data, setData] = useState<SidebarData | null>(null);

	const workspaceId = params?.workspaceId;

	const refresh = useCallback(async () => {
		try {
			const qs = workspaceId
				? `?workspaceId=${encodeURIComponent(workspaceId)}`
				: "";
			const res = await fetch(`/api/sidebar${qs}`, { cache: "no-store" });
			if (!res.ok) return;
			const json = (await res.json()) as { data: SidebarData };
			setData(json.data);
		} catch {
			// Sidebar renders the preset demo data until the first successful fetch.
		}
	}, [workspaceId]);

	useEffect(() => {
		void refresh();

		// Realtime replaces the 15s polling: thread status/title/binding changes
		// for this workspace patch the local rows in place; hard-deleted threads
		// are removed from the list. No reordering — the initial listThreads
		// fetch stays the source of order; NEW threads are ignored until a
		// later refresh (they arrive with their first UPDATE).
		const unsubscribe = subscribeToRealtime({
			supabase: supabaseClient,
			channelName: `sidebar-threads:${workspaceId ?? "all"}`,
			config: {
				event: "*",
				schema: "public",
				table: "threads",
				...(workspaceId
					? { filter: `workspace_id=eq.${workspaceId}` }
					: {}),
			},
			onStatus: (status) => {
				if (status === "CHANNEL_ERROR" || status === "SUBSCRIBE_ERROR") {
					console.error("[workspace-sidebar] threads channel failed", status);
				}
			},
			onEvent: ({
				eventType,
				new: row,
				old,
			}: {
				eventType?: string;
				new?: Record<string, unknown>;
				old?: Record<string, unknown>;
			}) => {
				const id = eventType === "DELETE" ? old?.id : row?.id;
				if (typeof id !== "string" || id === "") return;
				if (eventType === "DELETE") {
					setData((prev) => {
						if (!prev) return prev;
						const nextThreads = prev.threads.filter((t) => t.id !== id);
						return nextThreads.length === prev.threads.length
							? prev
							: { ...prev, threads: nextThreads };
					});
					return;
				}
				if (eventType !== "UPDATE") return;
				const attrs = row as Record<string, unknown> | null;
				if (attrs == null) return;
				setData((prev) => {
					if (!prev) return prev;
					const nextThreads = [...prev.threads];
					const idx = nextThreads.findIndex((t) => t.id === id);
					if (idx === -1) return prev;
					const current = nextThreads[idx]!;
					nextThreads[idx] = {
						...current,
						title:
							typeof attrs.title === "string" && attrs.title
								? attrs.title
								: current.title,
						status:
							typeof attrs.status === "string"
								? attrs.status
								: current.status,
						boundWorkflowId:
							typeof attrs.bound_workflow_id === "string"
								? attrs.bound_workflow_id
								: current.boundWorkflowId,
						updatedAt:
							typeof attrs.updated_at === "string"
								? attrs.updated_at
								: current.updatedAt,
					};
					return { ...prev, threads: nextThreads };
				});
			},
		});

		return () => {
			unsubscribe();
		};
	}, [workspaceId, refresh]);

	const mutate = useCallback(
		async (body: Record<string, unknown>) => {
			try {
				const res = await fetch("/api/sidebar/create", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				});
				if (!res.ok) return null;
				const json = (await res.json().catch(() => null)) as {
					data?: { id?: string };
				} | null;
				await refresh();
				return json?.data ?? null;
			} catch {
				return null;
			}
		},
		[refresh],
	);

	const createThread = useCallback(
		async (wsId: string, groupId: string | null, title: string) => {
			const created = await mutate({
				kind: "thread",
				workspaceId: wsId,
				groupId: groupId ?? undefined,
				title,
			});
			if (created?.id) {
				router.push(`/workspace/${wsId}/${created.id}` as Route);
			}
		},
		[mutate, router],
	);

	const createGroup = useCallback(
		async (wsId: string, name: string) => {
			await mutate({ kind: "group", workspaceId: wsId, name });
		},
		[mutate],
	);

	const renameThread = useCallback(
		async (id: string, newTitle: string) => {
			await mutate({ kind: "rename-thread", id, name: newTitle });
		},
		[mutate],
	);

	const deleteThread = useCallback(
		async (id: string) => {
			await mutate({ kind: "delete-thread", id });
			if (params?.threadId === id && data) {
				router.push(`/workspace/${data.workspace.id}` as Route);
			}
		},
		[mutate, params?.threadId, data, router],
	);

	const renameGroup = useCallback(
		async (id: string, newName: string) => {
			await mutate({ kind: "rename-group", id, name: newName });
		},
		[mutate],
	);

	const deleteGroup = useCallback(
		async (id: string) => {
			await mutate({ kind: "delete-group", id });
		},
		[mutate],
	);

	const switchWorkspace = useCallback(
		(id: string) => {
			router.push(`/workspace/${id}` as Route);
		},
		[router],
	);

	const openThread = useCallback(
		(wsId: string, threadId: string) => {
			router.push(`/workspace/${wsId}/${threadId}` as Route);
		},
		[router],
	);

	const logout = useCallback(async () => {
		await supabaseClient.auth.signOut();
		router.push("/signup");
	}, [router]);

	/** Run trigger: opens the thread, which starts in run mode and shows the
	 *  Run button; the actual run request goes through /api/threads/[id]/run
	 *  then the thread page sends the run-trigger message. */
	const runThread = useCallback(
		async (threadId: string) => {
			await fetch(`/api/threads/${encodeURIComponent(threadId)}/run`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ action: "run" }),
			}).catch(() => undefined);
			if (data?.workspace && params?.threadId !== threadId) {
				router.push(
					`/workspace/${data.workspace.id}/${threadId}` as Route,
				);
			}
		},
		[data?.workspace, params?.threadId, router],
	);

	const stopThread = useCallback(async (threadId: string) => {
		await fetch(`/api/threads/${encodeURIComponent(threadId)}/run`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ action: "stop" }),
		}).catch(() => undefined);
		void refresh();
	}, [refresh]);

	const runAll = useCallback(
		(threadIds: string[]) => {
			void (async () => {
				for (const id of threadIds) {
					await runThread(id);
				}
				void refresh();
			})();
		},
		[runThread, refresh],
	);

	const stopAll = useCallback(
		(threadIds: string[]) => {
			void (async () => {
				for (const id of threadIds) {
					await stopThread(id);
				}
			})();
		},
		[stopThread],
	);

	return (
		<AppSidebar
			data={data ?? undefined}
			activeThreadId={params?.threadId}
			onCreateGroup={createGroup}
			onCreateThread={createThread}
			onOpenThread={openThread}
			onSwitchWorkspace={switchWorkspace}
			onWorkspaceMutated={refresh}
			onRenameThread={renameThread}
			onDeleteThread={deleteThread}
			onRenameGroup={renameGroup}
			onDeleteGroup={deleteGroup}
			onRunThread={runThread}
			onStopThread={stopThread}
			onRunAll={runAll}
			onStopAll={stopAll}
			onLogout={logout}
		/>
	);
}