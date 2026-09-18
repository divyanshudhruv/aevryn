"use client";

import { getBrowserSupabase } from "@aevryn/auth";
import { useCallback, useEffect, useState } from "react";

import { subscribeToRealtime } from "@/lib/realtime-channel";

export interface PlanStepView {
	id: string;
	position: number;
	title: string;
	description: string | null;
	status: string;
}

export function usePlanSteps(workflowId: string | null) {
	const supabase = getBrowserSupabase();
	const [steps, setSteps] = useState<PlanStepView[]>([]);

	const load = useCallback(async () => {
		if (!workflowId) {
			setSteps([]);
			return;
		}
		const res = await fetch(`/api/workflows/${workflowId}`, {
			cache: "no-store",
		});
		if (!res.ok) {
			setSteps([]);
			return;
		}
		const json = (await res.json()) as {
			data: { steps?: Array<Record<string, unknown>> } | null;
		};
		const rows = json.data?.steps ?? [];
		setSteps(
			rows.map((s) => ({
				id: String(s.id),
				position: Number(s.position),
				title: String(s.title),
				description: (s.description as string | null) ?? null,
				status: String(s.status ?? "idle"),
			})),
		);
	}, [workflowId]);

	/** Client-side reset: marks every step idle so the progress slider jumps
	 *  back to step 1 the moment a new run starts, before the agent's
	 *  updateStepStatus writes arrive over realtime. */
	const reset = useCallback(() => {
		setSteps((prev) =>
			prev.map((s) => ({ ...s, status: "idle" })),
		);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (!workflowId) return;
		const unsubscribe = subscribeToRealtime({
			supabase,
			channelName: `plan_steps:${workflowId}`,
			config: {
				event: "*",
				schema: "public",
				table: "plan_steps",
				filter: `workflow_id=eq.${workflowId}`,
			},
			maxRetries: 4,
			onEvent: ({ eventType, new: row, old }) => {
				if (eventType === "DELETE") {
					setSteps((prev) =>
						prev.filter((s) => s.id !== (old?.id as string | undefined)),
					);
					return;
				}
				if (!row?.id) return;
				setSteps((prev) => {
					const idx = prev.findIndex((s) => s.id === row.id);
					const updated = {
						id: row.id as string,
						position: Number(row.position ?? prev[idx]?.position ?? 0),
						title:
							typeof row.title === "string"
								? row.title
								: (prev[idx]?.title ?? ""),
						description:
							(row.description as string | null) ??
							(prev[idx]?.description ?? null),
						status: String(row.status ?? prev[idx]?.status ?? "idle"),
					};
					if (idx === -1) {
						return [...prev, updated];
					}
					const next = [...prev];
					next[idx] = updated;
					return next;
				});
			},
		});
		return () => {
			unsubscribe();
		};
	}, [workflowId, supabase]);

	return { steps, reload: load, reset };
}