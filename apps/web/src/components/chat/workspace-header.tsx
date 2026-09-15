"use client";

import {
	DropdownMenu,
	DropdownTrigger,
	DropdownContent,
	DropdownSearch,
	DropdownLabel,
	DropdownEmpty,
} from "@aevryn/ui/components/ui/dropdown";
import { Button } from "@aevryn/ui/components/ui/button";
import { MenuItem } from "@aevryn/ui/components/ui/menu-item";
import InputGroup, {
	InputField,
} from "@aevryn/ui/components/ui/input-group";
import { getBrowserSupabase } from "@aevryn/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useIcon } from "@aevryn/ui/lib/icon-context";


export interface ProviderModelOption {
	providerSlug: string;
	providerName: string;
	modelId: string;
	modelName: string;
}

type ThreadItem = {
	id: string;
	title: string;
	groupId: string | null;
};

type ThreadGroup = {
	label: string;
	items: ThreadItem[];
};

interface WorkspaceHeaderProps {
	workspaceId: string;
	threadId: string;
	models: ProviderModelOption[];
	selectedModel: ProviderModelOption | null;
	onSelectModel: (model: ProviderModelOption) => void;
		onRenameTitle?: (title: string) => void;
		onRun?: () => void;
	isRunning?: boolean;
		onOpenSettings?: () => void;
}

export function WorkspaceHeader({
	workspaceId,
	threadId,
	models,
	selectedModel,
	onSelectModel,
	onRenameTitle,
	onRun,
	isRunning = false,
	onOpenSettings,
}: WorkspaceHeaderProps) {
	const router = useRouter();
	const ChevronsUpDown = useIcon("chevrons-up-down");
	const Play = useIcon("play");
	const Sliders = useIcon("sliders-horizontal");
	const ChevronDown = useIcon("chevron-down");

	const supabase = getBrowserSupabase();

	const [threads, setThreads] = useState<ThreadItem[]>([]);
	const [query, setQuery] = useState("");
	const [modelQuery, setModelQuery] = useState("");
	const [draftTitle, setDraftTitle] = useState("");

	const current = threads.find((t) => t.id === threadId);

	// Threads of this workspace, live via Supabase realtime (Header.tsx pattern).
	useEffect(() => {
		let cancelled = false;

		async function fetchThreads() {
			const { data } = await supabase
				.from("threads")
				.select("id, title, group_id")
				.eq("workspace_id", workspaceId);
			if (!cancelled && data) {
				setThreads(
					data.map((t: Record<string, unknown>) => ({
						id: t.id as string,
						title: (t.title as string) || "Untitled",
						groupId: (t.group_id as string | null) ?? null,
					})),
				);
			}
		}
		void fetchThreads();

		const channel = supabase
			.channel(`threads:header:${workspaceId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "threads",
					filter: `workspace_id=eq.${workspaceId}`,
				},					(payload: {
						eventType?: string;
						new?: Record<string, unknown>;
						old?: Record<string, unknown>;
					}) => {
						const row = payload.new ?? payload.old;
						if (!row?.id) return;
					setThreads((prev) => {
						const byId = new Map(prev.map((t) => [t.id, t]));
						if (payload.eventType === "DELETE") {
							byId.delete(row.id as string);
						} else {
							byId.set(row.id as string, {
								id: row.id as string,
								title: (row.title as string) || "Untitled",
								groupId: (row.group_id as string | null) ?? null,
							});
						}
						return Array.from(byId.values());
					});
				},
			)
			.subscribe();

		return () => {
			cancelled = true;
			void supabase.removeChannel(channel);
		};
	}, [workspaceId, supabase]);

	// Keep the title draft in sync with the current thread.
	const currentTitle = current?.title ?? "";
	useEffect(() => {
		setDraftTitle(currentTitle);
	}, [threadId, currentTitle]);

	const commitTitle = () => {
		const trimmed = draftTitle.trim();
		if (!trimmed || trimmed === current?.title) {
			setDraftTitle(current?.title ?? "");
			return;
		}
		// Persist directly (same Supabase technique as the sidebar), then sync.
		void supabase
			.from("threads")
			.update({ title: trimmed })
			.eq("id", threadId)
			.then(({ error: updateError }: { error: { message: string } | null }) => {
				if (updateError) {
					setDraftTitle(current?.title ?? "");
					return;
				}
				setThreads((prev) =>
					prev.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t)),
				);
				onRenameTitle?.(trimmed);
			});
	};

	const groupedThreads = useMemo((): ThreadGroup[] => {
		const filtered = query
			? threads.filter((t) =>
					t.title.toLowerCase().includes(query.toLowerCase()),
				)
			: threads;
		const map = new Map<string, ThreadGroup>();
		for (const t of filtered) {
			const key = t.groupId ?? "__ungrouped__";
			const group = map.get(key);
			if (group) group.items.push(t);
			else
				map.set(key, {
					label: key === "__ungrouped__" ? "Other threads" : "Section",
					items: [t],
				});
		}
		return Array.from(map.values());
	}, [threads, query]);

	const filteredModels = useMemo(() => {
		const q = modelQuery.trim().toLowerCase();
		if (!q) return models;
		return models.filter(
			(m) =>
				m.modelName.toLowerCase().includes(q) ||
				m.providerName.toLowerCase().includes(q),
		);
	}, [models, modelQuery]);

	return (
		<header className="flex h-12 shrink-0 items-center border-b border-border/60 px-4">
			<div className="flex w-full flex-row items-center justify-between">
				<div className="flex min-w-0 flex-row items-center gap-px">
					{/* Thread switcher — Header.tsx, real data */}
					<DropdownMenu>
						<DropdownTrigger
							render={
								<Button variant="ghost" trailingIcon={ChevronDown}>
									{current?.title || "Select a thread"}
								</Button>
							}
						/>
						<DropdownContent side="bottom" align="start" sideOffset={6}>
							<DropdownSearch
								value={query}
								onValueChange={setQuery}
								placeholder="Search threads"
							/>
							{groupedThreads.length === 0 ? (
								<DropdownEmpty>No threads found</DropdownEmpty>
							) : (
								groupedThreads.map((group) => (
									<div key={group.label}>
										<DropdownLabel>{group.label}</DropdownLabel>
										{									group.items.map((item, index) => (
										<MenuItem
											key={item.id}
											index={index}
											label={item.title}
												checked={item.id === threadId ? true : undefined}
												onSelect={() => {
													if (item.id !== threadId) {
														router.push(
															`/workspace/${workspaceId}/${item.id}`,
														);
													}
												}}
											/>
										))}
									</div>
								))
							)}
						</DropdownContent>
					</DropdownMenu>

					{/* Inline-editable thread title (persists via Supabase) */}
					<InputGroup className="min-w-0 max-w-xs flex-1">
						<InputField
							index={0}
							labelHidden
							label="Thread title"
							className="truncate"
							value={draftTitle}
							onChange={setDraftTitle}
							onBlur={commitTitle}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									(event.target as HTMLInputElement).blur();
								}
							}}
						/>
					</InputGroup>
				</div>

				<div className="flex shrink-0 flex-row items-center gap-2">
					{onRun && (
						<Button
							variant="ghost"
							leadingIcon={Play}
							onClick={onRun}
							disabled={isRunning}
						>
							{isRunning ? "Running…" : "Run"}
						</Button>
					)}
					<Button leadingIcon={Sliders} onClick={onOpenSettings}>
						Settings
					</Button>

					{/* Model picker */}
					<DropdownMenu>
						<DropdownTrigger
							render={
								<Button
									variant="secondary"
									size="sm"
									aria-label="Select model"
									className="w-56 justify-between"
								>
									<span className="min-w-0 truncate text-[13px]">
										{selectedModel
											? `${selectedModel.modelName} · ${selectedModel.providerName}`
											: "Select model"}
									</span>
									<ChevronsUpDown
										size={14}
										strokeWidth={1.5}
										className="ml-2 shrink-0 text-muted-foreground"
									/>
								</Button>
							}
						/>
						<DropdownContent side="bottom" align="end" sideOffset={6}>
							<DropdownSearch
								value={modelQuery}
								onValueChange={setModelQuery}
								placeholder="Search models…"
							/>
							{filteredModels.length === 0 ? (
								<DropdownEmpty>No models — add a provider in Settings</DropdownEmpty>
							) : (
								filteredModels.map((model, index) => (
									<MenuItem
										key={`${model.providerSlug}:${model.modelId}`}
										index={index}
										label={`${model.modelName} · ${model.providerName}`}
										checked={
											selectedModel?.providerSlug === model.providerSlug &&
											selectedModel?.modelId === model.modelId
												? true
												: undefined
										}
										onSelect={() => onSelectModel(model)}
									/>
								))
							)}
						</DropdownContent>
					</DropdownMenu>
				</div>
			</div>
		</header>
	);
}
