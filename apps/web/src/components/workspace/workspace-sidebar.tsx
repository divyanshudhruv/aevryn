"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppSidebar, type SidebarData } from "@aevryn/ui/components/sidebar-preset/app-sidebar";

/**
 * Real-data wrapper around the sidebar preset. Fetches GET /api/sidebar and
 * wires all mutations to POST /api/sidebar/create. Styling is the preset's.
 */
export function WorkspaceSidebar() {
	const params = useParams<{ workspaceId?: string; threadId?: string }>();
	const router = useRouter();
	const [data, setData] = useState<SidebarData | null>(null);

	const workspaceId = params?.workspaceId;

	const refresh = useCallback(async () => {
		try {
			const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
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
			const res = await fetch("/api/sidebar/create", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const json = (await res.json().catch(() => null)) as {
				data?: { id?: string };
			} | null;
			void refresh();
			return json?.data ?? null;
		},
		[refresh],
	);

	const createThread = useCallback(
		async (groupId: string | null) => {
			if (!data) return;
			const created = await mutate({
				kind: "thread",
				workspaceId: data.workspace.id,
				groupId: groupId ?? undefined,
			});
			if (created?.id) {
				router.push(`/workspace/${data.workspace.id}/${created.id}`);
			}
		},
		[data, mutate, router],
	);

	const createGroup = useCallback(async () => {
		if (!data) return;
		const name = window.prompt("Group name");
		if (!name?.trim()) return;
		await mutate({ kind: "group", workspaceId: data.workspace.id, name });
	}, [data, mutate]);

	const renameThread = useCallback(
		async (threadId: string) => {
			const name = window.prompt("New title");
			if (!name?.trim()) return;
			await mutate({ kind: "rename-thread", id: threadId, name });
		},
		[mutate],
	);

	const deleteThread = useCallback(
		async (threadId: string) => {
			if (!window.confirm("Delete this thread?")) return;
			await mutate({ kind: "delete-thread", id: threadId });
			if (params?.threadId === threadId && data) {
				router.push(`/workspace/${data.workspace.id}`);
			}
		},
		[mutate, params?.threadId, data, router],
	);

	const renameGroup = useCallback(
		async (groupId: string) => {
			const name = window.prompt("New group name");
			if (!name?.trim()) return;
			await mutate({ kind: "rename-group", id: groupId, name });
		},
		[mutate],
	);

	const deleteGroup = useCallback(
		async (groupId: string) => {
			if (!window.confirm("Delete this group? Its threads move to ungrouped."))
				return;
			await mutate({ kind: "delete-group", id: groupId });
		},
		[mutate],
	);

	const switchWorkspace = useCallback(
		(id: string) => {
			router.push(`/workspace/${id}`);
		},
		[router],
	);

	return (
		<AppSidebar
			data={data ?? undefined}
			onNewThread={() => void createThread(null)}
			onCreateThread={(groupId) => void createThread(groupId)}
			onSwitchWorkspace={switchWorkspace}
			onRenameThread={(id) => void renameThread(id)}
			onDeleteThread={(id) => void deleteThread(id)}
			onRenameGroup={(id) => void renameGroup(id)}
			onDeleteGroup={(id) => void deleteGroup(id)}
		/>
	);
}
