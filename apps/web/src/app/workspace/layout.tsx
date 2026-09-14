import {
  SidebarInset,
  SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";

import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";

export default function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <WorkspaceSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}