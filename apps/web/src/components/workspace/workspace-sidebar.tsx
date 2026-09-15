"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Route } from "next";
import {
	AppSidebar,
	type SidebarData,
} from "@aevryn/ui/components/sidebar-preset/app-sidebar";
import { supabaseClient } from "@/lib/supabase-client";

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
		const id = window.setInterval(() => void refresh(), 15_000);
		return () => window.clearInterval(id);
	}, [refresh]);

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
		router.push("/login");
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