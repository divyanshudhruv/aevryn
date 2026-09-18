"use client";

import { useParams } from "next/navigation";

import { SidebarTrigger } from "@aevryn/ui/components/ui/sidebar";

export function WorkspaceTopbar() {
  const { threadId } = useParams<{ threadId?: string }>();

  if (threadId) return null;

  return <SidebarTrigger className="m-2" />;
}
