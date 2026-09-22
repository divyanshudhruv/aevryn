import type { RunStatus } from "@aevryn/config";

export interface NavItem {
	label: string;
	status: RunStatus;
	badge?: string;
}

export interface NavSection {
	label: string;
	items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
	{
		label: "WORK",
		items: [
			{ label: "New pricing page exploration", status: "running", badge: "2" },
			{ label: "Component library audit", status: "running", badge: "5" },
			{
				label: "Dark mode token pass",
				status: "awaiting_approval",
				badge: "3",
			},
			{ label: "Add new feature", status: "idle", badge: "2" },
		],
	},
	{
		label: "HOME",
		items: [
			{ label: "Scrollbar fade regression", status: "completed", badge: "9" },
			{ label: "Fix homepage layout", status: "failed", badge: "123" },
			{ label: "Add new feature", status: "sleeping", badge: "2" },
			{ label: "Update documentation", status: "running", badge: "3" },
		],
	},
	{
		label: "GITHUB",
		items: [
			{ label: "Fix sidebar layout", status: "sleeping", badge: "1" },
			{ label: "Registry deploy pipeline", status: "running", badge: "4" },
		],
	},
	{
		label: "ALL STATUSES",
		items: [
			{ label: "Running", status: "running" },
			{ label: "Awaiting Approval", status: "awaiting_approval" },
			{ label: "Idle", status: "idle" },
			{ label: "Sleeping", status: "sleeping" },
			{ label: "Completed", status: "completed" },
			{ label: "Failed", status: "failed" },
		],
	},
	{
		label: "NO WORKING",
		items: [
			{ label: "Idle", status: "idle" },
			{ label: "Completed", status: "completed" },
			{ label: "Failed", status: "failed" },
		],
	},
	{ label: "EMPTY", items: [] },
];
