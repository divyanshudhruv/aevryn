import { ChatComposer } from "@aevryn/ui/components/chat-composer";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string; threadId?: string }>;
}) {
  return (
  
    
      <div className="mx-auto flex min-h-full bg-red-400 max-w-3xl flex-col items-end">
        <ChatComposer />e
      </div>
    
  );
}
