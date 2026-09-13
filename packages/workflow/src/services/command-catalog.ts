/**
 * Command catalog — server-side JSON module (NOT a database table).
 * The backend supplies the catalog; the command menu in packages/ui renders
 * groups, shortcuts, and filtered rows. Move into global_settings later if
 * it should be editable from the app.
 */

export interface CommandEntry {
	id: string;
	label: string;
	shortcut?: string;
	group: string;
	/** "user-wide" | "workspace" | "thread" — caller filters by context. */
	scope: "user-wide" | "workspace" | "thread";
	/** Route hint or action identifier for the client. */
	action: string;
	payload?: Record<string, unknown>;
	order: number;
	enabled: boolean;
}

const CATALOG: CommandEntry[] = [
	{
		id: "notifications",
		label: "Notifications",
		shortcut: "N",
		group: "Navigation",
		scope: "user-wide",
		action: "open-notifications",
		order: 1,
		enabled: true,
	},
	{
		id: "new-thread",
		label: "New thread",
		shortcut: "T",
		group: "Navigation",
		scope: "workspace",
		action: "new-thread",
		order: 2,
		enabled: true,
	},
	{
		id: "open-settings",
		label: "Open settings",
		shortcut: ",",
		group: "Navigation",
		scope: "user-wide",
		action: "open-settings",
		order: 3,
		enabled: true,
	},
	{
		id: "go-workspace",
		label: "Go to workspace",
		group: "Navigation",
		scope: "user-wide",
		action: "navigate:/workspace",
		order: 4,
		enabled: true,
	},
	{
		id: "workflow-run",
		label: "Run workflow now",
		group: "Workflow",
		scope: "thread",
		action: "workflow-run-now",
		order: 10,
		enabled: true,
	},
	{
		id: "workflow-schedule",
		label: "Manage schedule",
		group: "Workflow",
		scope: "thread",
		action: "open-schedule-dialog",
		order: 11,
		enabled: true,
	},
];

export function listCommandCatalog(scope?: CommandEntry["scope"]): CommandEntry[] {
	return CATALOG.filter((entry) => entry.enabled && (!scope || entry.scope === scope)).sort(
		(a, b) => a.order - b.order,
	);
}
