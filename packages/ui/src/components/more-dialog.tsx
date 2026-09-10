import { useState } from "react";

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
  memories: MemoryInfo[];
  memoriesBusy?: boolean;
  onDeleteMemory: (id: string) => void;
  onDeleteAll?: () => void;
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

function PlaceholderTab({ title }: { title: string }) {
	return (
		<p className="py-8 text-center text-[12px] text-muted-foreground">
			{title} arrives in the next update.
		</p>
	);
}

export function MoreDialog({
	open,
	onClose,
	threadId,
	memories,
	memoriesBusy,
	onDeleteMemory,
	onDeleteAll,
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
					{threadId
						? "Thread memories and workspace tools."
						: "Workspace memories and tools."}
				</DialogDescription>

				<div className="flex shrink-0 items-center gap-1 px-3 pt-2 pb-3">
					{TABS.map((t) => (
						<Button
							key={t.id}
							variant={tab === t.id ? "secondary" : "ghost"}
							size="sm"
							onClick={() => setTab(t.id)}
							className={cn(
								tab !== t.id && "text-muted-foreground",
							)}
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
						<PlaceholderTab title="Settings" />
					) : (
						<PlaceholderTab title="Export & share" />
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}