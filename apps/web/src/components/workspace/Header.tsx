"use client";

import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownLabel,
  DropdownEmpty,
} from "@aevryn/ui/components/ui/dropdown";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@aevryn/ui/components/ui/button";
import MenuItem from "@aevryn/ui/components/ui/menu-item";
import { InputGroup, InputField } from "@aevryn/ui/components/ui/input-group";
import { getBrowserSupabase } from "@aevryn/auth";
import { useParams } from "next/navigation";
import { useEffect } from "react";

type ThreadItem = {
  id: string;
  label: string;
  groupId: string;
  status?: string;
};

export function Header({
  workspaceId,
  threadId,
}: {
  workspaceId: string;
  threadId?: string;
}) {
  const params = useParams<{ workspaceId: string; threadId?: string }>();

  const supabase = getBrowserSupabase();

  const [thread, setThread] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState<string>("");
  const [threads, setThreads] = useState<ThreadItem[]>([]);

  useEffect(() => {
    async function fetchThreads() {
      const { data, error } = await supabase
        .from("threads")
        .select(
          `
          id,
          title,
          groupId,
          status
        `,
        )
        .eq("workspaceId", workspaceId);

      if (!error && data) {
        setThreads(
          data.map((t: any) => ({
            id: t.id,
            label: t.title || "Untitled",
            groupId: t.groupId,
            status: t.status,
          })),
        );
      }
    }
    fetchThreads();
  }, [workspaceId]);

  // If threadId is provided, find the matching thread and set it as thread
  useEffect(() => {
    if (threadId) {
      const found = threads.find((t) => t.id === threadId);
      if (found) {
        setThread(found.label);
      }
    }
  }, [threadId, threads]);

  return (
    <header className="flex h-12 shrink-0 items-center px-4">
      <div className="flex w-full flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-px">
          <DropdownMenu>
            <DropdownTrigger
              render={
                <Button variant="ghost" trailingIcon={ChevronDown}>
                  {thread || "Select a thread"}
                </Button>
              }
            />
            <DropdownContent checkedIndex={undefined}>
              <DropdownSearch
                value={query}
                onValueChange={setQuery}
                placeholder="Search threads"
              />
              {threads.map((thread, idx) => {
                // Determine group label from groupId (simple mapping for now)
                const groupLabel = thread.groupId;

                return (
                  <MenuItem
                    key={thread.id}
                    index={idx}
                    label={thread.label}
                    onSelect={() => setThread(thread.label)}
                  >
                    {thread.label}
                    {thread.status === "running" && (
                      <span className="ml-2 text-xs font-semibold bg-primary/10 text-primary rounded">
                        Running
                      </span>
                    )}
                  </MenuItem>
                );
              })}
              {threads.length === 0 && (
                <DropdownEmpty>No threads found</DropdownEmpty>
              )}
            </DropdownContent>
          </DropdownMenu>
        </div>

        {threadId ? (
          <InputGroup className="mb-1">
            <InputField
              index={0}
              className="truncate"
              label=""
              id="thread-name"
              placeholder="Thread name"
              value={threadId}
              onChange={() => {}}
            />
          </InputGroup>
        ) : null}
      </div>
    </header>
  );
}
