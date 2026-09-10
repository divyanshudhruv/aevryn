"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import {
  SidebarInset,
  SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceHeader } from "@/components/workspace-header";
import { trpc } from "@/utils/trpc";
import { useThreadStore } from "@/stores/thread-store";

export default function WorkspacePage() {
  const router = useRouter();
  const { addThread, setActiveThread } = useThreadStore();

  const sendMessage = useMutation(
    trpc.agent.sendMessage.mutationOptions({
      onSuccess: (data, variables) => {
        addThread({
          id: data.workflowId,
          objective: variables.message,
          status: "queued",
          createdAt: new Date().toISOString(),
        });
        setActiveThread(data.workflowId);
        router.push(`/workspace/${data.workflowId}`);
      },
    }),
  );

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div
          className="flex h-full min-h-0 flex-col"
          suppressHydrationWarning
        >
          <WorkspaceHeader />
          <section
            aria-label="New thread"
            className="flex min-h-0 flex-1 items-center justify-center p-4"
          >
            <div className="w-full max-w-3xl">
              <ChatComposer
                demo={false}
                onSubmitMessage={(text) =>
                  sendMessage.mutate({ message: text })
                }
              />
            </div>
          </section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}