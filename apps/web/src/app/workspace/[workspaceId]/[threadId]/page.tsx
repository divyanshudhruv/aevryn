import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { notFound } from "next/navigation";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ workspaceId: string; threadId: string }>;
}) {
  const { threadId } = await params;

  if (!threadId) {
    notFound();
  }

  return (
    <div className="gap-6 mx-auto flex max-w-3xl w-full flex-col">
      <span className="text-center text-xl font-normal text-muted-foreground">
        Meet Aevryn, your personal Anakin workflow assistant.
      </span>
      <ChatComposer />
    </div>
  );
}
