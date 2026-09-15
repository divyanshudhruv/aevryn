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

import { relativeTime } from "@/lib/relative-time";

type ThreadItem = {
  id: string;
  title: string;
  groupId: string | null;
  boundWorkflowId: string | null;
  lastMessageAt: string | null;
};

type GroupedItem = {
  id: string;
  title: string;
  idx: number;
};

type ThreadGroup = {
  label: string;
  items: GroupedItem[];
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

  const [activeLabel, setActiveLabel] = useState<string | undefined>(undefined);
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
          group_id,
          bound_workflow_id,
          last_message_at
        `,
        )
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null);

      if (!error && data) {          setThreads(
            data.map((t: any) => ({
              id: t.id,
              title: t.title || "Untitled",
              groupId: t.group_id ?? null,
              boundWorkflowId: t.bound_workflow_id ?? null,
              lastMessageAt: t.last_message_at ?? null,
            })),
          );
      }
    }
    fetchThreads();

    const channel = supabase
      .channel(`threads:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "threads",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: any) => {
          setThreads((prev) => {
            const byId = new Map(prev.map((t) => [t.id, t]));

            if (payload.eventType === "DELETE") {
              byId.delete(payload.old.id);
            } else if (payload.new.deleted_at != null) {
              byId.delete(payload.new.id);
            } else {
              const next: ThreadItem = {
                id: payload.new.id,
                title: payload.new.title || "Untitled",
                groupId: (payload.new.group_id as string | null) ?? null,
                boundWorkflowId:
                  (payload.new.bound_workflow_id as string | null) ?? null,
                lastMessageAt: (payload.new.last_message_at as string | null) ?? null,
              };
              byId.set(payload.new.id, next);
            }

            return Array.from(byId.values());
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, supabase]);

  useEffect(() => {
    if (threadId) {
      const found = threads.find((t) => t.id === threadId);
      if (found) {
        setActiveLabel(found.title);
      }
    }
  }, [threadId, threads]);

  const groupedThreads = ((): ThreadGroup[] => {
    const filtered = query
      ? threads.filter((t) =>
          t.title.toLowerCase().includes(query.toLowerCase()),
        )
      : threads;

    const map = new Map<string, ThreadGroup>();
    let idx = 0;

    for (const t of filtered) {
      const key = t.groupId ?? "__ungrouped__";
      const existing = map.get(key);
      if (existing) {
        existing.items.push({ id: t.id, title: t.title, idx: idx++ });
      } else {
        map.set(key, {
          label: key === "__ungrouped__" ? "Other threads" : "Section",
          items: [{ id: t.id, title: t.title, idx: idx++ }],
        });
      }
    }

    return Array.from(map.values());
  })();

  return (
    <header className="flex h-12 shrink-0 items-center px-4">
      <div className="flex w-full flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-px">
          <DropdownMenu>
            <DropdownTrigger
              render={
                <Button variant="ghost" trailingIcon={ChevronDown}>
                  {activeLabel || "Select a thread"}
                </Button>
              }
            />
            <DropdownContent checkedIndex={undefined}>
              <DropdownSearch
                value={query}
                onValueChange={setQuery}
                placeholder="Search threads"
              />
              {groupedThreads.map((group) => (
                <DropdownLabel key={group.label}>{group.label}</DropdownLabel>
              ))}
              {groupedThreads.flatMap((group) =>
                group.items.map((item) => {
                  const thread = threads.find((t) => t.id === item.id);
                  const activity = relativeTime(thread?.lastMessageAt);
                  return (
                    <MenuItem
                      key={item.id}
                      index={item.idx}
                      label={item.title}
                      trailing={activity}
                      onSelect={() => setActiveLabel(item.title)}
                    />
                  );
                }),
              )}
              {threads.length === 0 && (
                <DropdownEmpty>No threads found</DropdownEmpty>
              )}
            </DropdownContent>
          </DropdownMenu>
        </div>

        {threadId && threads.length > 0 ? (
          <InputGroup className="mb-1">
            <InputField
              index={0}
              className="truncate"
              label=""
              labelHidden
              id="thread-name"
              placeholder="Thread name"
              value={threads.find((t) => t.id === threadId)?.title ?? ""}
              onChange={() => {}}
            />
          </InputGroup>
        ) : null}
      </div>
    </header>
  );
}
