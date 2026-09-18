"use client";

import { SidebarTrigger } from "@aevryn/ui/components/ui/sidebar";
import { useParams } from "next/navigation";

export function WorkspaceTopbar() {
	const { threadId } = useParams<{ threadId?: string }>();

	if (threadId) return null;

	return <SidebarTrigger className="m-2" />;
}
