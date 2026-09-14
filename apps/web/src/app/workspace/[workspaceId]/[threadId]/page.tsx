"use client";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { useState } from "react";

export default function ThreadPage() {
  const [status, setStatus] = useState<"idle" | "streaming">("idle");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end p-4">
          <p className="mx-auto pb-16 text-center text-sm text-muted-foreground">
            No messages yet.
          </p>
        </div>
      </section>
      <footer className="shrink-0 p-3">
        <div className="mx-auto max-w-3xl">
          <ChatComposer
            status={status}
            onSend={() => setStatus("streaming")}
            onStop={() => setStatus("idle")}
          />
        </div>
      </footer>
    </div>
  );
}