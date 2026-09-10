import { useEffect, useState } from "react";

import type { MemoryInfo } from "@aevryn/ui/lib/chat-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@aevryn/ui/components/ui/dialog";
import { Button } from "@aevryn/ui/components/ui/button";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { cn } from "@aevryn/ui/lib/utils";

type Tab = "memories" | "settings" | "export";

export interface MoreDialogProps {
  open: boolean;
  onClose: () => void;
  threadId?: string;
  objective: string;
  customPrompt: string;
  saveBusy?: boolean;
  onSaveSettings: (values: { objective: string; customPrompt: string }) => void;
  memories: MemoryInfo[];
  memoriesBusy?: boolean;
  onDeleteMemory: (id: string) => void;
  onDeleteAll?: () => void;
  exportData: unknown;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "memories", label: "Memories" },
  { id: "settings", label: "Settings" },
  { id: "export", label: "Export" },
];

function formatWhen(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

const inputClass =
	"w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40";

function MemoriesTab({
	memories,
	busy,
	onDelete,
	onDeleteAll,
}: {
	memories: MemoryInfo[];
	busy?: boolean;
	onDelete: (id: string) => void;
	onDeleteAll?: () => void;
}) {
	const TrashIcon = useIcon("dustbin");
	return (
		<div className="flex flex-col">
			<div className="mb-1 flex items-center justify-between">
				<p className="text-[12px] text-muted-foreground">
					{memories.length === 0
						? "No memory stored yet."
						: `${memories.length} stored`}
				</p>
				{onDeleteAll && memories.length > 0 && (
					<Button variant="ghost" size="sm" onClick={onDeleteAll} loading={busy}>
						Delete all
					</Button>
				)}
			</div>
			<ul className="divide-y divide-border/60">
				{memories.map((m) => (
					<li key={m.id} className="group flex items-start gap-2 py-2.5">
						<div className="min-w-0 flex-1">
							<p className="text-[13px] leading-snug text-pretty">{m.text}</p>
							<p className="mt-0.5 text-[11px] text-muted-foreground">
								<span className="capitalize">{m.category}</span> ·{" "}
								{formatWhen(m.createdAt)}
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							className="shrink-0 text-muted-foreground hover:text-destructive"
							aria-label="Delete memory"
							onClick={() => onDelete(m.id)}
						>
							<TrashIcon size={13} strokeWidth={1.75} />
						</Button>
					</li>
				))}
			</ul>
		</div>
	);
}

function SettingsTab({
	objective,
	customPrompt,
	busy,
	onSave,
}: {
	objective: string;
	customPrompt: string;
	busy?: boolean;
	onSave: (values: { objective: string; customPrompt: string }) => void;
}) {
	const [draftObjective, setDraftObjective] = useState(objective);
	const [draftCustom, setDraftCustom] = useState(customPrompt);

	useEffect(() => {
		setDraftObjective(objective);
		setDraftCustom(customPrompt ?? "");
	}, [objective, customPrompt]);

	const dirty =
		draftObjective.trim() !== objective.trim() ||
		draftCustom.trim() !== (customPrompt ?? "").trim();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<label className="text-[12px] font-medium text-foreground">
					Objective
				</label>
				<textarea
					className={cn(inputClass, "h-[56px]")}
					value={draftObjective}
					placeholder="What is this workflow trying to achieve?"
					onChange={(e) => setDraftObjective(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-1">
				<label className="text-[12px] font-medium text-foreground">
					Custom system prompt
				</label>
				<textarea
					className={cn(inputClass, "h-[120px]")}
					value={draftCustom}
					placeholder="Extra instructions the agent should follow. The original prompt stays hidden — only this runs."
					onChange={(e) => setDraftCustom(e.target.value)}
				/>
			</div>
			<Button
				variant="secondary"
				size="sm"
				disabled={!dirty}
				loading={busy}
				onClick={() =>
					onSave({
						objective: draftObjective.trim() || objective,
						customPrompt: draftCustom.trim(),
					})
				}
				className="self-start"
			>
				Save changes
			</Button>
		</div>
	);
}

function ExportTab({ exportData }: { exportData: unknown }) {
	const [shareUrl, setShareUrl] = useState("");
	const [email, setEmail] = useState("");
	const [inviteSent, setInviteSent] = useState(false);

	const link = `${window.location.origin}/share/${
		shareUrl || "ae-00000000000000000000"
	}`;

	const exportJson = () => {
		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "aevryn-thread.json";
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<label className="text-[12px] font-medium text-foreground">
					Export
				</label>
				<div className="flex flex-wrap gap-1.5">
					<Button variant="secondary" size="sm" onClick={exportJson}>
						Export JSON
					</Button>
					<Button variant="secondary" size="sm" onClick={() => window.print()}>
						Print / PDF
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<label className="text-[12px] font-medium text-foreground">
					Shareable link
				</label>
				<div className="flex flex-col gap-1.5">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => {
							const token = `ae-${Date.now().toString(36)}${Math.random()
								.toString(36)
								.slice(2, 8)}`;
							setShareUrl(token);
							void navigator.clipboard?.writeText(
								`${window.location.origin}/share/${token}`,
							);
						}}
					>
						{shareUrl ? "Generate new link" : "Generate link"}
					</Button>
					{shareUrl && (
						<p className="break-all text-[12px] text-muted-foreground">{link}</p>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<label className="text-[12px] font-medium text-foreground">
					Email invite
				</label>
				<div className="flex flex-row gap-1.5">
					<input
						className={cn(inputClass, "h-auto flex-1")}
						type="email"
						placeholder="teammate@example.com"
						value={email}
						onChange={(e) => {
							setEmail(e.target.value);
							setInviteSent(false);
						}}
					/>
					<Button
						variant="secondary"
						size="sm"
						disabled={!email.trim()}
						onClick={() => {
							setInviteSent(true);
							setEmail("");
						}}
					>
						Send
					</Button>
				</div>
				{inviteSent && (
					<p className="text-[12px] text-muted-foreground">
						Invite sent (demo).
					</p>
				)}
			</div>
		</div>
	);
}

export function MoreDialog({
	open,
	onClose,
	objective,
	customPrompt,
	saveBusy,
	onSaveSettings,
	memories,
	memoriesBusy,
	onDeleteMemory,
	onDeleteAll,
	exportData,
}: MoreDialogProps) {
	const [tab, setTab] = useState<Tab>("memories");

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!value) onClose();
			}}
		>
			<DialogContent className="flex max-h-[min(560px,calc(100dvh-4rem))] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden p-0">
				<DialogTitle className="px-4 pt-4">More</DialogTitle>
				<DialogDescription className="sr-only">
					Thread memories, settings, and export tools.
				</DialogDescription>

				<div className="flex shrink-0 items-center gap-1 px-3 pt-2 pb-3">
					{TABS.map((t) => (
						<Button
							key={t.id}
							variant={tab === t.id ? "secondary" : "ghost"}
							size="sm"
							onClick={() => setTab(t.id)}
							className={cn(tab !== t.id && "text-muted-foreground")}
						>
							{t.label}
						</Button>
					))}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60 px-4 py-3">
					{tab === "memories" ? (
						<MemoriesTab
							memories={memories}
							busy={memoriesBusy}
							onDelete={onDeleteMemory}
							onDeleteAll={onDeleteAll}
						/>
					) : tab === "settings" ? (
						<SettingsTab
							objective={objective}
							customPrompt={customPrompt}
							busy={saveBusy}
							onSave={onSaveSettings}
						/>
					) : (
						<ExportTab exportData={exportData} />
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}