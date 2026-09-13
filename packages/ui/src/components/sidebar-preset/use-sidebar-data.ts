"use client";

import { useEffect, useRef, useState } from "react";

import { getBrowserSupabase } from "@aevryn/auth";

/** A thread row as the sidebar renders it. */
export interface SidebarThread {
	id: string;
	title: string;
	/** Owning group id, or null when the thread lives ungrouped in the
	 *  workspace (group delete sets group_id = NULL via ON DELETE SET NULL). */
	groupId: string | null;
	/** Workflow the thread is bound to, or null for plain chats. */
	boundWorkflowId: string | null;
	/** Most recent message time (ISO) — drives recency ordering. */
	lastMessageAt: string | null;
	/** Status derived from the bound workflow, or `idle` when none is bound. */
	status: 
		| "running"
		| "sleeping"
		| "awaiting_approval"
		| "failed"
		| "completed"
		| "idle"
		| "planning"
		| "stopped";
	/** When true, the leading indicator reflects live execution status. */
	showStatusIndicator?: boolean;
}

/** A group row with its threads, ordered by position then recency. */
export interface SidebarGroup {
	id: string;
	name: string;
	position: number;
	threads: SidebarThread[];
}

/** The signed-in user's identity fields, synced at login from the provider. */
export interface SidebarUser {
	id: string;
	name: string;
	email: string;
	pfp: string;
}

/** Every workspace the user has created (created_by = auth.uid()). */
export interface SidebarWorkspace {
	id: string;
	name: string;
}

export interface SidebarData {
	user: SidebarUser | null;
	workspaces: SidebarWorkspace[];
	/** Workspace-scoped: groups of the passed workspaceId with their threads. */
	groups: SidebarGroup[];
	loading: boolean;
}

/** Reusable query that builds the SidebarData shape from raw Supabase rows. */
async function fetchSidebarData(
	supabase: ReturnType<typeof getBrowserSupabase>,
	userId: string,
	workspaceId: string,
	prev: SidebarData | null,
): Promise<SidebarData> {
	const [profileRes, workspacesRes, groupsRes, threadsRes] =
		await Promise.all([
			supabase
				.from("user_profiles")
				.select("name,email,pfp")
				.eq("user_id", userId)
				.maybeSingle(),
			supabase
				.from("workspaces")
				.select("id,name")
				.eq("created_by", userId)
				.order("created_at", { ascending: true }),
			supabase
				.from("groups")
				.select("id,name,position")
				.eq("workspace_id", workspaceId)
				.order("position", { ascending: true }),
			supabase
				.from("threads")
				.select(
					"id,title,group_id,bound_workflow_id,last_message_at,deleted_at",
				)
				.eq("workspace_id", workspaceId)
				.is("deleted_at", null)
				.order("last_message_at", {
					ascending: false,
					nullsFirst: false,
				}),
		]);

	const sidebarUser: SidebarUser = {
		id: userId,
		name: profileRes.data?.name ?? prev?.user?.name ?? "",
		email: profileRes.data?.email ?? prev?.user?.email ?? userId,
		pfp: profileRes.data?.pfp ?? prev?.user?.pfp ?? "",
	};

	const workspaces: SidebarWorkspace[] =
		workspacesRes.data?.map((w: { id: string; name: string }) => ({
			id: w.id,
			name: w.name,
		})) ?? prev?.workspaces ?? [];const threads: SidebarThread[] = (
		(threadsRes.data ?? []) as Array<{
			id: string;
			title: string;
			group_id: string | null;
			bound_workflow_id: string | null;
			last_message_at: string | null;
		}>
	).map((t) => ({
		id: t.id,
		title: t.title || "Untitled",
		groupId: t.group_id,
		boundWorkflowId: t.bound_workflow_id,lastMessageAt: t.last_message_at,
		status: "idle",
		// Thread status comes from the bound workflow, not from threads directly.
		// For MVP we resolve it with one extra query for the bound workflows.
	 showStatusIndicator: !!t.bound_workflow_id,
	}));
	if (threads.length > 0) {
		const boundWorkflowIds = threads
			.map((t) => t.boundWorkflowId)
			.filter((id): id is string => id !== null);

		if (boundWorkflowIds.length > 0) {
			try {
				const workflowRes = await supabase
					.from("workflows")
					.select("id,status")
					.in("id", boundWorkflowIds);

				const workflowStatusByWorkflow = workflowRes.data?.reduce((acc: Record<string, SidebarThread["status"] | null>, w: { id: string; status: SidebarThread["status"] | null }) => {
					acc[w.id] = w.status;
					return acc;
				}, {} as Record<string, SidebarThread["status"] | null>) ?? {};

				for (const t of threads) {
					if (!t.boundWorkflowId) {
						continue;
					}
	
					const workflowStatus =
						workflowStatusByWorkflow[t.boundWorkflowId] ?? null;
	
					t.status = workflowStatus ?? ("idle" as const);
	
				}
			} catch {
				// keep the already-assigned placeholder idle status
			}
		}
	}
	const byGroup = new Map<string, SidebarThread[]>();
	const orphans: SidebarThread[] = [];
	for (const t of threads) {
		if (t.groupId) {
			const bucket = byGroup.get(t.groupId);
			if (bucket) bucket.push(t);
			else byGroup.set(t.groupId, [t]);
		} else {
			orphans.push(t);
		}
	}

	const groups: SidebarGroup[] = (
		(groupsRes.data ?? []) as Array<{
			id: string;
			name: string;
			position: number;
		}>
	).map((g) => ({
		id: g.id,
		name: g.name,
		position: g.position,
		threads: byGroup.get(g.id) ?? [],
	}));
	if (orphans.length > 0) {
		groups.push({
			id: "__ungrouped__",
			name: "UNGROUPED",
			position: Number.MAX_SAFE_INTEGER,
			threads: orphans,
		});
	}

	return { user: sidebarUser, workspaces, groups, loading: false };
}

/**
 * Fetches everything the sidebar displays in one round trip per table:
 * - auth user (id)
 * - user_profiles row for name/email/pfp (synced at login by
 *   syncProfileFromAuth — an empty name means the sync hasn't run yet)
 * - all workspaces created by the user (workspace switcher)
 * - the current workspace's groups (name + position, ordered) and their
 *   non-deleted threads (group id, bound workflow id, title), ordered by
 *   last message time.
 * RLS scopes every query to the signed-in user.
 *
 * After the initial fetch, a workspace-scoped realtime channel keeps the
 * groups + threads in sync for INSERT / UPDATE / DELETE (and the pointers
 * by which a thread is bucketed under its group). The channel is RLS-aware
 * via the user filter, so the client only receives rows it is allowed to see.
 *
 * Returns a `refetch` function so dialogs/actions that mutate data (create
 * group, create thread, delete, rename) can immediately refresh the sidebar
 * without waiting for the realtime event — useful when realtime isn't
 * enabled on the project or the change originates from a different client.
 */
export function useSidebarData(workspaceId: string): SidebarData & {
	refetch: () => void;
} {
	const [data, setData] = useState<SidebarData>({
		user: null,
		workspaces: [],
		groups: [],
		loading: true,
	});

	const dataRef = useRef(data);
	dataRef.current = data;

	const supabaseRef = useRef<ReturnType<typeof getBrowserSupabase> | null>(
		null,
	);
	const userIdRef = useRef<string>("");
	const refreshFromDbRef = useRef<(() => void) | null>(null);
	const channelRef = useRef<
		Awaited<ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]>> | null
	>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setData((d) => ({ ...d, loading: true }));
			const supabase = getBrowserSupabase();
			supabaseRef.current = supabase;

			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				if (!cancelled) {
					setData({ user: null, workspaces: [], groups: [], loading: false });
				}
				return;
			}
			userIdRef.current = user.id;

			const sidebarData = await fetchSidebarData(
				supabase,
				user.id,
				workspaceId,
				null,
			);
			if (cancelled) return;
			setData(sidebarData);

			// Realtime channel: keep groups + threads in sync for this
			// workspace. RLS-scoped via the user config, so the client only
			// receives rows it is allowed to see.
			const channel = supabase.channel(`workspace:${workspaceId}`, {
				config: { user: { id: user.id } },
			}).on(
				"postgres_changes",
				{
					event: "*",
					table: "groups",
					filter: `workspace_id = '${workspaceId}'`,
				},
				() => {
					if (cancelled) return;
					refreshFromDbRef.current?.();
				},
			).on(
				"postgres_changes",
				{
					event: "*",
					table: "threads",
					filter: `workspace_id = '${workspaceId}'`,
				},
				() => {
					if (cancelled) return;
					refreshFromDbRef.current?.();
				},
			).subscribe();
			channelRef.current = channel;

			// Store the refresh closure so the public refetch + realtime
			// callbacks both call the same function.
			refreshFromDbRef.current = () =>
				fetchSidebarData(supabase, user.id, workspaceId, dataRef.current).then(
					(setData),
				);
		}

		load();
		return () => {
			cancelled = true;
			channelRef.current?.unsubscribe();
		};
	}, [workspaceId]);

	const refetch = () => {
		if (!supabaseRef.current || !userIdRef.current) return;
		refreshFromDbRef.current?.();
	};

	return { ...data, refetch };
}
