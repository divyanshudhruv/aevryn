import { useEffect, useRef } from "react";

import { Button } from "./ui/button";
import type { NotificationInfo } from "../lib/chat-types";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { cn } from "@aevryn/ui/lib/utils";

function formatRelative(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const diff = Date.now() - date.getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function subjectLine(n: NotificationInfo): string {
	if (n.subject) return n.subject;
	const short =
		typeof n.body === "object" && n.body !== null
			? JSON.stringify(n.body).slice(0, 120)
			: null;
	return short ?? n.type;
}

export interface NotificationsPanelProps {
	open: boolean;
	notifications: NotificationInfo[];
	onClose: () => void;
	onMarkAllRead: () => void;
}

export function NotificationsPanel({
	open,
	notifications,
	onClose,
	onMarkAllRead,
}: NotificationsPanelProps) {
	const XIcon = useIcon("x");
	const BellIcon = useIcon("bell");
	const unread = notifications.filter((n) => !n.readAt).length;
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	return (
		<div
			aria-hidden={!open}
			className={cn(
				"fixed inset-0 z-50 flex justify-end transition-opacity duration-200",
				open ? "opacity-100" : "pointer-events-none opacity-0",
			)}
		>
			<div
				className="absolute inset-0 bg-black/40 dark:bg-black/80"
				onClick={onClose}
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-label="Notifications"
				className={cn(
					"relative flex h-full w-[min(100vw,380px)] shrink-0 flex-col border-l border-border bg-surface-2 shadow-surface-2 transition-transform duration-200",
					open ? "translate-x-0" : "translate-x-full",
				)}
			>
				<div className="flex shrink-0 items-center gap-2 px-4 py-3">
					<BellIcon size={16} strokeWidth={1.75} />
					<h2 className="text-[13px] font-medium">
						Notifications
						{unread > 0 && (
							<span className="ml-1.5 text-muted-foreground">
								· {unread} new
							</span>
						)}
					</h2>
					<Button
						variant="ghost"
						size="icon-sm"
						className="ml-auto"
						onClick={onClose}
						aria-label="Close notifications"
					>
						<XIcon size={14} strokeWidth={1.75} />
					</Button>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60">
					{notifications.length === 0 ? (
						<p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
							No notifications yet.
						</p>
					) : (
						<ul className="divide-y divide-border/60">
							{notifications.map((n) => (
								<li key={n.id} className="flex flex-col gap-1 px-4 py-3">
									<div className="flex items-baseline gap-2">
										<span
											className={cn(
												"h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full",
												n.readAt ? "bg-border" : "bg-foreground",
											)}
										/>
										<span className="text-[13px]">{subjectLine(n)}</span>
									</div>
									<span className="pl-3.5 text-[12px] text-muted-foreground">
										{formatRelative(n.createdAt)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>

				{notifications.length > 0 && (
					<div className="shrink-0 border-t border-border/60 p-2">
						<Button
							variant="ghost"
							size="sm"
							disabled={unread === 0}
							onClick={onMarkAllRead}
							className="w-full justify-center"
						>
							Mark all as read
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}