"use client";

import { cn } from "@aevryn/ui/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { InputField, InputGroup } from "../ui/input-group";
import { Switch } from "../ui/switch";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

// ---------------------------------------------------------------------------
// Shared row used by workflow section panels.
// ---------------------------------------------------------------------------

function SettingRow({
	label,
	description,
	children,
	className,
}: {
	label: string;
	description?: string | ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-6 border-border/60 border-b py-4 last:border-b-0",
				className,
			)}
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="text-[13px] text-foreground">{label}</span>
				{description && (
					<div className="w-full text-[12px] text-muted-foreground">
						{description}
					</div>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Shared data types + loading.
// ---------------------------------------------------------------------------

export interface WorkflowStepItem {
	id: string;
	title: string;
	description: string | null;
	status: string;
}

export interface WorkflowData {
	workflow: {
		id: string;
		title: string;
		objective: string;
		instructions: string | null;
		autoApprove: boolean;
		status: string;
	};
	steps: WorkflowStepItem[];
}

export function useWorkflowData(workflowId: string | null) {
	const [data, setData] = useState<WorkflowData | null>(null);
	const [loading, setLoading] = useState(false);

	const reload = useCallback(async () => {
		if (!workflowId) {
			setData(null);
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(
				`/api/workflows/${encodeURIComponent(workflowId)}`,
				{ cache: "no-store" },
			);
			if (res.ok) {
				const json = (await res.json()) as { data: WorkflowData };
				setData(json.data);
			} else {
				setData(null);
			}
		} catch {
			setData(null);
		} finally {
			setLoading(false);
		}
	}, [workflowId]);

	useEffect(() => {
		void reload();
	}, [reload]);

	return { data, loading, reload };
}

// ---------------------------------------------------------------------------
// Section panels.
// ---------------------------------------------------------------------------

function GeneralPanel({
	workflowId,
	onDeleted,
}: {
	workflowId: string;
	onDeleted?: () => void;
}) {
	const { data, reload } = useWorkflowData(workflowId);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [deleteWorkflowOpen, setDeleteWorkflowOpen] = useState(false);

	// Sync the form once data arrives; afterwards it's locally editable.
	const [synced, setSynced] = useState<string | null>(null);
	useEffect(() => {
		if (data && synced !== data.workflow.id) {
			setName(data.workflow.title);
			setDescription(data.workflow.objective);
			setSynced(data.workflow.id);
		}
	}, [data, synced]);

	const patch = useCallback(
		async (body: Record<string, unknown>) => {
			await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			void reload();
		},
		[workflowId, reload],
	);

	const handleDelete = async () => {
		await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
			method: "DELETE",
		});
		setDeleteWorkflowOpen(false);
		onDeleted?.();
	};

	if (!data) {
		return (
			<p className="text-[13px] text-muted-foreground">
				{deleteWorkflowOpen ? null : "No workflow is bound to this thread yet."}
			</p>
		);
	}

	return (
		<>
			<ConfirmDeleteDialog
				open={deleteWorkflowOpen}
				onOpenChange={setDeleteWorkflowOpen}
				title="Delete workflow"
				description="This deletes the workflow and its plan. Threads that are bound to it will keep running with their last saved instructions."
				actionLabel="Delete workflow"
				items={[{ value: data.workflow.title || "This workflow" }]}
				onConfirm={handleDelete}
			/>
			<InputGroup className="w-full">
				<InputField
					label="Name"
					value={name}
					onChange={(e) => setName(e)}
					placeholder="e.g. My workflow"
					index={0}
					onBlur={() => {
						const t = name.trim();
						if (t && t !== data.workflow.title) void patch({ title: t });
					}}
				/>
				<InputField
					label="Description"
					value={description}
					onChange={(e) => setDescription(e)}
					placeholder="Describe what this workflow does"
					index={1}
					onBlur={() => {
						if (description !== data.workflow.objective)
							void patch({ objective: description });
					}}
				/>
			</InputGroup>
			<div>
				{" "}
				<SettingRow
					label="Auto approve"
					description="Let this workflow run without asking first when it uses known safe tools."
				>
					<Switch
						label={data.workflow.autoApprove ? "On" : "Off"}
						checked={data.workflow.autoApprove}
						onToggle={() => {
							const next = !data.workflow.autoApprove;
							void patch({ autoApprove: next });
						}}
					/>
				</SettingRow>
			</div>
		</>
	);
}

function PlanPanel({ workflowId }: { workflowId: string }) {
	const { data, reload } = useWorkflowData(workflowId);

	const [rows, setRows] = useState<
		Array<{ id: string; title: string; description: string; status: string }>
	>([]);
	// Re-sync local rows whenever the persisted shapes change (new ids after a
	// reload) so in-progress edits never fight the server copy.
	const syncKey = data
		? `${data.workflow.id}:${data.steps.map((s) => s.id).join(",")}`
		: null;
	const [synced, setSynced] = useState<string | null>(null);
	useEffect(() => {
		if (data && syncKey && synced !== syncKey) {
			setRows(
				data.steps.map((s) => ({
					id: s.id,
					title: s.title,
					description: s.description ?? "",
					status: s.status,
				})),
			);
			setSynced(syncKey);
		}
	}, [data, syncKey, synced]);

	const persist = useCallback(
		async (
			steps: Array<{ id?: string; title: string; description: string }>,
		) => {
			await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/steps`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					steps: steps.map((s) => ({
						id: s.id,
						title: s.title.trim() || "Untitled step",
						description: s.description.trim() || null,
					})),
				}),
			});
			void reload();
		},
		[workflowId, reload],
	);

	const updateRow = (
		id: string,
		patch: Partial<Pick<(typeof rows)[number], "title" | "description">>,
	) =>
		setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

	const moveItem = (from: number, to: number) => {
		if (from === to) return;
		const next = [...rows];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved!);
		void persist(next);
	};

	const removeItem = (id: string) => {
		void persist(rows.filter((item) => item.id !== id));
	};

	const addStep = () => {
		void persist([...rows, { title: "New step", description: "" }]);
	};

	if (!data) {
		return (
			<p className="text-[13px] text-muted-foreground">
				No workflow is bound to this thread yet.
			</p>
		);
	}

	return (
		<div className="flex flex-col">
			{rows.length === 0 ? (
				<p className="text-[13px] text-muted-foreground">No steps yet.</p>
			) : (
				<div className="flex flex-col">
					{rows.map((item, index) => (
						<div
							key={item.id}
							className="flex flex-col gap-2 border-border/60 border-b py-3 last:border-b-0"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-medium text-[13px] text-foreground">
									Step {index + 1}
								</span>
								<div className="flex items-center gap-1">
									<Badge color={statusColor(item.status)} size="sm">
										{item.status}
									</Badge>
									<Button
										variant="secondary"
										size="icon-compact"
										disabled={index === 0}
										onClick={() => moveItem(index, index - 1)}
									>
										<ArrowUp />
									</Button>
									<Button
										variant="secondary"
										size="icon-compact"
										disabled={index === rows.length - 1}
										onClick={() => moveItem(index, index + 1)}
									>
										<ArrowDown />
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => removeItem(item.id)}
									>
										Remove
									</Button>
								</div>
							</div>
							<InputGroup className="w-full">
								<InputField
									index={0}
									label="Title"
									value={item.title}
									onChange={(v) => updateRow(item.id, { title: v })}
									onBlur={() => void persist(rows)}
									placeholder="Step title"
								/>
								<InputField
									index={1}
									label="Description"
									value={item.description}
									onChange={(v) => updateRow(item.id, { description: v })}
									onBlur={() => void persist(rows)}
									placeholder="What this step does"
								/>
							</InputGroup>
						</div>
					))}
				</div>
			)}
			<div className="pt-4">
				<Button variant="secondary" size="sm" onClick={addStep}>
					Add step
				</Button>
			</div>
		</div>
	);
}

function statusColor(status: string) {
	switch (status) {
		case "running":
		case "queued":
			return "blue";
		case "completed":
		case "approved":
			return "green";
		case "failed":
		case "error":
		case "cancelled":
			return "red";
		case "awaiting_approval":
			return "amber";
		default:
			return "gray";
	}
}

function InstructionsPanel({ workflowId }: { workflowId: string }) {
	const { data, reload } = useWorkflowData(workflowId);
	const [instructions, setInstructions] = useState("");
	const [synced, setSynced] = useState<string | null>(null);

	useEffect(() => {
		if (data && synced !== data.workflow.id) {
			setInstructions(data.workflow.instructions ?? "");
			setSynced(data.workflow.id);
		}
	}, [data, synced]);

	const persist = useCallback(
		async (value: string) => {
			await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ instructions: value || null }),
			});
			void reload();
		},
		[workflowId, reload],
	);

	if (!data) {
		return (
			<p className="text-[13px] text-muted-foreground">
				No workflow is bound to this thread yet.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<InputGroup className="w-full">
				<InputField
					index={0}
					label="Instructions"
					value={instructions}
					onChange={setInstructions}
					placeholder="Extra rules for this workflow, such as tone, format, or things to avoid."
					onBlur={() => {
						if (instructions !== (data.workflow.instructions ?? ""))
							void persist(instructions);
					}}
				/>
			</InputGroup>
			<p className="text-[12px] text-muted-foreground">
				The agent follows these instructions whenever this workflow runs —
				alongside the plan it generated.
			</p>
		</div>
	);
}

function MemoriesPanel({ threadId }: { threadId: string }) {
	const [memories, setMemories] = useState<
		Array<{ id: string; memory: string }>
	>([]);
	const [loading, setLoading] = useState(true);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(
				`/api/memories?threadId=${encodeURIComponent(threadId)}`,
				{ cache: "no-store" },
			);
			if (res.ok) {
				const json = (await res.json()) as {
					data: { memories: Array<{ id: string; memory: string }> };
				};
				setMemories(json.data.memories ?? []);
			} else {
				setMemories([]);
			}
		} catch {
			setMemories([]);
		} finally {
			setLoading(false);
		}
	}, [threadId]);

	useEffect(() => {
		void reload();
	}, [reload]);

	const removeMemory = async (id: string) => {
		await fetch(
			`/api/memories?threadId=${encodeURIComponent(threadId)}&id=${encodeURIComponent(id)}`,
			{ method: "DELETE" },
		);
		void reload();
	};

	if (loading) {
		return (
			<p className="text-[13px] text-muted-foreground">
				{memories.length === 0 ? "No memories yet." : "Loading memories…"}
			</p>
		);
	}

	return (
		<div className="flex flex-col">
			{memories.length === 0 ? (
				<p className="text-[13px] text-muted-foreground">
					No memories yet. The agent saves what it learns here as this workflow
					runs.
				</p>
			) : (
				memories.map((item) => (
					<SettingRow key={item.id} label="Memory" description={item.memory}>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => void removeMemory(item.id)}
						>
							Remove
						</Button>
					</SettingRow>
				))
			)}
			<p className="mt-4 text-[12px] text-muted-foreground">
				Memories are scoped to this conversation. They are shared with the agent
				here and never cross to other threads.
			</p>
		</div>
	);
}

export type WorkflowSectionId =
	| "general"
	| "plan"
	| "instructions"
	| "memories";

export function WorkflowSectionPanel({
	id,
	workflowId,
	threadId,
	onDeleted,
}: {
	id: WorkflowSectionId;
	workflowId: string | null;
	threadId: string | null;
	onDeleted?: () => void;
}) {
	if (!workflowId) {
		return (
			<p className="text-[13px] text-muted-foreground">
				Ask the agent to plan something, approve the plan, and bind it — then
				its settings appear here.
			</p>
		);
	}
	switch (id) {
		case "plan":
			return <PlanPanel workflowId={workflowId} />;
		case "instructions":
			return <InstructionsPanel workflowId={workflowId} />;
		case "memories":
			return threadId ? (
				<MemoriesPanel threadId={threadId} />
			) : (
				<p className="text-[13px] text-muted-foreground">
					Memories are per-conversation — open this dialog from a thread.
				</p>
			);
		default:
			return <GeneralPanel workflowId={workflowId} onDeleted={onDeleted} />;
	}
}
