import { ChatComposer } from "@aevryn/ui/components/chat-composer";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string; threadId?: string }>;
}) {
  return (
    <div className="mx-auto flex min-h-full bg-red-400 max-w-3xl flex-col items-center justify-center w-full h-full">
      {!(await params).threadId && (
        <p className="text-center text-md mt-8 text-muted-foreground">
          Select a thread or create a new one to start a conversation.
        </p>
      )}
    </div>
  );
}
