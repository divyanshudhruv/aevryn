import {
  SidebarProvider,
  SidebarInset,
} from "@aevryn/ui/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { Header } from "@/components/workspace/Header";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string; threadId?: string }>;
}) {
  const { workspaceId, threadId } = await params;

  return (
    <SidebarProvider>
      <WorkspaceSidebar />

      <SidebarInset>
        <div className="flex h-screen min-h-0 flex-col overflow-hidden">
          {/* Fixed at the top; content scrolls under it */}
          <Header workspaceId={workspaceId} threadId={threadId} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
