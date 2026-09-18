import {
	SidebarInset,
	SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";

import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { WorkspaceTopbar } from "@/components/workspace/workspace-topbar";

export const metadata = {
	title: {
		default: "Workspaces · Aevryn",
		template: "%s · Aevryn",
	},
	description:
		"Your Aevryn workspaces — agents that search, scrape, and research the live web with your own key.",
};

export default function WorkspaceLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<SidebarProvider>
			<WorkspaceSidebar />
			<SidebarInset>
				<WorkspaceTopbar />
				<div className="flex min-h-0 flex-1 flex-col">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
