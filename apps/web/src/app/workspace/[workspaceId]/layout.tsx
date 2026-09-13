import {
  SidebarProvider,
  SidebarInset,
} from "@aevryn/ui/components/ui/sidebar";
import { AppSidebar } from "@aevryn/ui/components/sidebar-preset/app-sidebar";
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
      <AppSidebar workspaceId={workspaceId} />

      <SidebarInset>
        <section
          aria-label="Conversation"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <Header workspaceId={workspaceId} threadId={threadId} />
          <div className="flex flex-col items-center justify-center h-full">
            {children}
          </div>
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
