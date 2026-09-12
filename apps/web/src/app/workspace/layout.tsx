
import {
  SidebarProvider,
  SidebarInset,
} from "@aevryn/ui/components/ui/sidebar";
import { AppSidebar } from "@aevryn/ui/components/sidebar-preset/app-sidebar";
import { Header } from "@/components/workspace/Header";



export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset>
        <section
          aria-label="Conversation"
          className="min-h-0 flex-1 overflow-y-auto "
        >
          <Header />
          {children}
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
