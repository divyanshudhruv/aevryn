import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import Image from "next/image";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string; threadId?: string }>;
}) {
  return (
    <div className="mx-auto flex  bg-red-400 max-w-3xl flex-col items-center justify-center w-full ">
      {!(await params).threadId && (
        <Image
          src="/placeholder.png"
          alt="Placeholder"
          width={200}
          height={200}
        />
      )}
    </div>
  );
}
