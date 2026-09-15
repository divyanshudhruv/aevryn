"use client";

import { getBrowserSupabase } from "@aevryn/auth";
import { useCallback, useEffect, useState } from "react";

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

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (!workflowId) return;
		const channel = supabase
			.channel(`plan_steps:${workflowId}`)
			.on(
				"postgres_changes",
				{
					event: "UPDATE",
					schema: "public",
					table: "plan_steps",
					filter: `workflow_id=eq.${workflowId}`,
				},
				(payload: { new?: Record<string, unknown> }) => {
					const row = payload.new;
					if (!row?.id) return;
					setSteps((prev) => {
						const idx = prev.findIndex((s) => s.id === row.id);
						if (idx === -1) return prev;
						const next = [...prev];
						next[idx] = {
							...next[idx]!,
							status: String(row.status ?? next[idx].status),
							title: typeof row.title === "string" ? row.title : next[idx].title,
							description:
								(row.description as string | null) ?? next[idx].description,
						};
						return next;
					});
				},
			)
			.subscribe();
		return () => {
			void supabase.removeChannel(channel);
		};
	}, [workflowId, supabase]);

	return { steps, reload: load };
}
