"use client";

import {
	CommandMenu,
	CommandMenuDialog,
	CommandMenuEmpty,
	CommandMenuFilters,
	CommandMenuFooter,
	CommandMenuInput,
	type CommandMenuItemData,
	CommandMenuList,
	CommandMenuShortcut,
	CommandMenuTabs,
} from "@aevryn/ui/components/command-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@aevryn/ui/components/ui/select";
import { type IconName, useIcons } from "@aevryn/ui/lib/icon-context";
import { useMemo, useState } from "react";

const ITEMS: readonly {
	value: string;
	label: string;
	action?: string;
	description?: string;
	icon: IconName;
	shortcut?: string;
	keywords?: readonly string[];
	group: string;
	disabled?: boolean;
}[] = [
	{
		value: "new-thread",
		label: "New thread",
		description: "In the current group",
		icon: "plus",
		shortcut: "mod+o",
		keywords: ["create", "chat", "conversation"],
		group: "Actions",
	},
	{
		value: "new-group",
		label: "New group",
		description: "Organize threads into a section",
		icon: "sliders-horizontal",
		keywords: ["create", "section", "folder"],
		group: "Actions",
	},
	{
		value: "rename-thread",
		label: "Rename this thread",
		icon: "pencil",
		keywords: ["edit", "title"],
		group: "Actions",
	},
	{
		value: "delete-thread",
		label: "Delete this thread",
		description: "Move to confirm dialog",
		icon: "dustbin",
		keywords: ["remove", "trash"],
		group: "Actions",
	},
	{
		value: "bind-workflow",
		label: "Bind a workflow…",
		description: "Plan → steps → automated runs",
		icon: "link",
		keywords: ["attach", "plan", "automate"],
		group: "Actions",
	},
	{
		value: "copy-thread-link",
		label: "Copy thread link",
		description: "Share this conversation's URL",
		icon: "link",
		shortcut: "mod+shift+c",
		keywords: ["share", "url", "copy"],
		group: "Actions",
	},
	{
		value: "toggle-theme",
		label: "Toggle theme",
		description: "Light ↔ dark",
		icon: "moon",
		shortcut: "mod+shift+l",
		keywords: ["appearance", "dark", "light"],
		group: "Actions",
	},
	{
		value: "open-settings",
		label: "Open settings",
		description: "Models, keys, notifications, appearance",
		icon: "settings",
		shortcut: "mod+,",
		keywords: ["preferences", "providers", "api"],
		group: "Actions",
	},
	{
		value: "new-workspace",
		label: "New workspace",
		description: "Not available yet",
		icon: "user",
		keywords: ["create", "team", "space"],
		group: "Actions",
		disabled: true,
	},

	{
		value: "run-thread",
		label: "Run this thread",
		description: "Execute its bound workflow",
		icon: "play",
		shortcut: "mod+enter",
		keywords: ["start", "execute", "workflow"],
		group: "Run",
	},
	{
		value: "stop-thread",
		label: "Stop this thread",
		description: "Cancel the running workflow",
		icon: "stop",
		keywords: ["cancel", "abort", "halt"],
		group: "Run",
	},
	{
		value: "run-all",
		label: "Run all in group",
		description: "Every runnable bound thread",
		icon: "play",
		keywords: ["batch", "execute", "all"],
		group: "Run",
	},
	{
		value: "stop-all",
		label: "Stop all in group",
		description: "Cancel every active run",
		icon: "stop",
		keywords: ["batch", "cancel", "all"],
		group: "Run",
	},
	{
		value: "switch-model",
		label: "Switch model…",
		description: "Pick from your providers",
		icon: "sliders-horizontal",
		keywords: ["provider", "groq", "llm", "change"],
		group: "Run",
	},
	{
		value: "thinking-budget",
		label: "Set thinking budget…",
		description: "Free · Low · Medium · High · Ultra · God",
		icon: "command",
		keywords: ["quality", "reasoning", "tokens", "effort"],
		group: "Run",
	},

	{
		value: "go-thread",
		label: "Go to thread…",
		description: "Type to search thread titles",
		icon: "search",
		keywords: ["find", "open", "conversation"],
		group: "Go to",
	},
	{
		value: "go-workspace",
		label: "Go to workspace…",
		description: "Switch the active workspace",
		icon: "user",
		keywords: ["switch", "space", "team"],
		group: "Go to",
	},
	{
		value: "go-notification",
		label: "Notifications",
		action: "Go to Notifications",
		description: "Threads needing attention",
		icon: "bell",
		keywords: ["failed", "approval", "attention", "retrying"],
		group: "Go to",
	},

	{
		value: "shortcuts",
		label: "Keyboard shortcuts",
		description: "Every shortcut in one sheet",
		icon: "command",
		shortcut: "mod+k",
		keywords: ["keys", "hotkeys"],
		group: "Help",
	},
	{
		value: "logout",
		label: "Log out",
		icon: "arrow-left",
		keywords: ["sign out", "session", "exit"],
		group: "Help",
	},
];

const SUGGESTIONS = ["new-thread", "run-thread", "go-thread", "open-settings"];

const TABS = [
	{ value: "all", label: "All" },
	{ value: "Actions", label: "Actions" },
	{ value: "Run", label: "Run" },
	{ value: "Go to", label: "Go to" },
	{ value: "Help", label: "Help" },
];

const TYPES = [
	{ value: "all", label: "All types" },
	{ value: "Actions", label: "Actions" },
	{ value: "Run", label: "Run" },
	{ value: "Go to", label: "Go to" },
	{ value: "Help", label: "Help" },
];
const SORTS = [
	{ value: "default", label: "Default order" },
	{ value: "az", label: "A to Z" },
];

export function CommandMenuDemo() {
	const icons = useIcons();
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState("all");
	const [type, setType] = useState("all");
	const [sort, setSort] = useState("default");
	const items = useMemo<CommandMenuItemData[]>(() => {
		const all = ITEMS.map(({ icon, ...item }) => ({
			...item,
			icon: icons[icon],
		}));
		let visible = all;
		if (tab !== "all") visible = visible.filter((item) => item.group === tab);
		if (type !== "all") visible = visible.filter((item) => item.group === type);
		if (sort === "az")
			visible = [...visible].sort((a, b) => a.label.localeCompare(b.label));
		return visible;
	}, [icons, tab, type, sort]);

	const run = (item: CommandMenuItemData) => {
		console.log("ran", item.value);
	};

	const filters = (
		<CommandMenuFilters>
			<Select value={type} onValueChange={setType}>
				<SelectTrigger variant="borderless" aria-label="Type" />
				<SelectContent>
					{TYPES.map((option, i) => (
						<SelectItem key={option.value} value={option.value} index={i}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select value={sort} onValueChange={setSort}>
				<SelectTrigger variant="borderless" aria-label="Sort" />
				<SelectContent>
					{SORTS.map((option, i) => (
						<SelectItem key={option.value} value={option.value} index={i}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</CommandMenuFilters>
	);

	return (
		<>
			<CommandMenuShortcut keys="mod+k" className="ml-1" />
			<CommandMenuDialog open={open} onOpenChange={setOpen} shortcut="mod+k">
				<CommandMenu items={items} suggestions={SUGGESTIONS} onSelect={run}>
					<CommandMenuInput placeholder="Type a command or search…" />
					<CommandMenuTabs tabs={TABS} value={tab} onValueChange={setTab}>
						{filters}
					</CommandMenuTabs>
					<CommandMenuList>
						<CommandMenuEmpty>No results.</CommandMenuEmpty>
					</CommandMenuList>
					<CommandMenuFooter />
				</CommandMenu>
			</CommandMenuDialog>
		</>
	);
}
