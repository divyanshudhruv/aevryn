"use client";

import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownLabel,
  DropdownEmpty,
} from "@aevryn/ui/components/ui/dropdown";
import { Button } from "@aevryn/ui/components/ui/button";
import { MenuItem } from "@aevryn/ui/components/ui/menu-item";

import { getBrowserSupabase } from "@aevryn/auth";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { SidebarTrigger } from "@aevryn/ui/components/ui/sidebar";

import { relativeTime } from "@/lib/relative-time";
import { subscribeToRealtime } from "@/lib/realtime-channel";

export interface ProviderModelOption {
  providerSlug: string;
  providerName: string;
  modelId: string;
  modelName: string;
}

type ThreadItem = {
  id: string;
  title: string;
  groupId: string | null;
  lastMessageAt: string | null;
};

type GroupedItem = {
  id: string;
  title: string;
  idx: number;
};

type ThreadGroup = {
  key: string;
  label: string;
  items: GroupedItem[];
};

interface GroupItem {
  id: string;
  name: string;
}

interface WorkspaceHeaderProps {
  workspaceId: string;
  threadId: string;
  models: ProviderModelOption[];
  selectedModel: ProviderModelOption | null;
  onSelectModel: (model: ProviderModelOption) => void;
  onRun?: () => void;
  isRunning?: boolean;
  runError?: string | null;
  onOpenSettings?: () => void;
}

export function WorkspaceHeader({
  workspaceId,
  threadId,
  models,
  selectedModel,
  onSelectModel,
  onRun,
  isRunning = false,
  runError,
  onOpenSettings,
}: WorkspaceHeaderProps) {
  const router = useRouter();
  const ChevronsUpDown = useIcon("chevrons-up-down");
  const Play = useIcon("play");
  const Stop = useIcon("stop");
  const Sliders = useIcon("sliders-horizontal");

  const supabase = getBrowserSupabase();

  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [query, setQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");

  const current = threads.find((t) => t.id === threadId);

  // Threads of this workspace, live via Supabase realtime (Header.tsx pattern).
  useEffect(() => {
    let cancelled = false;

    async function fetchThreads() {
      try {
        const { data, error } = await supabase
          .from("threads")
          .select("id, title, group_id, last_message_at")
          .eq("workspace_id", workspaceId);
        if (error) return;
        if (!cancelled && data) {
          setThreads(
            data.map((t: Record<string, unknown>) => ({
              id: t.id as string,
              title: (t.title as string) || "Untitled",
              groupId: (t.group_id as string | null) ?? null,
              lastMessageAt: (t.last_message_at as string | null) ?? null,
            })),
          );
        }
      } catch {
        // threads table may not exist yet
      }
    }

    async function fetchGroups() {
      try {
        const { data, error } = await supabase
          .from("groups")
          .select("id, name")
          .eq("workspace_id", workspaceId);
        if (error) return;
        if (!cancelled && data) {
          setGroups(
            data.map((g: Record<string, unknown>) => ({
              id: g.id as string,
              name: g.name as string,
            })),
          );
        }
      } catch {
        // groups table may not exist yet; non-critical
      }
    }

    void fetchGroups();

    void fetchThreads();

    const unsubscribe = subscribeToRealtime({
      supabase,
      channelName: `threads:header:${workspaceId}`,
      config: {
        event: "*",
        schema: "public",
        table: "threads",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      onStatus: (status) => {
        if (status === "CHANNEL_ERROR" || status === "SUBSCRIBE_ERROR") {
          console.error("[workspace-header] threads channel failed", status);
        }
      },
      onEvent: ({
        eventType,
        new: row,
        old,
      }: {
        eventType?: string;
        new?: Record<string, unknown>;
        old?: Record<string, unknown>;
      }) => {
        const used = row ?? old;
        if (!used?.id) return;
        setThreads((prev) => {
          const byId = new Map(prev.map((t) => [t.id, t]));
          if (eventType === "DELETE") {
            byId.delete(used.id as string);
          } else {
            byId.set(used.id as string, {
              id: used.id as string,
              title: (used.title as string) || "Untitled",
              groupId: (used.group_id as string | null) ?? null,
              lastMessageAt: (used.last_message_at as string | null) ?? null,
            });
          }
          return Array.from(byId.values());
        });
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [workspaceId, supabase]);

  const groupedThreads = useMemo((): ThreadGroup[] => {
    const filtered = query
      ? threads.filter((t) =>
          t.title.toLowerCase().includes(query.toLowerCase()),
        )
      : threads;
    const map = new Map<string, ThreadGroup>();
    let idx = 0;
    for (const t of filtered) {
      const key = t.groupId ?? "__ungrouped__";
      const group = map.get(key);
      if (group) {
        group.items.push({ id: t.id, title: t.title, idx: idx++ });
      } else {
        map.set(key, {
          key,
          label:
            key === "__ungrouped__"
              ? "Other threads"
              : (groups.find((g) => g.id === key)?.name ?? "Section"),
          items: [{ id: t.id, title: t.title, idx: idx++ }],
        });
      }
    }
    return Array.from(map.values());
  }, [threads, query, groups]);

  const currentIdx = useMemo((): number | undefined => {
    for (const group of groupedThreads) {
      const found = group.items.find((i) => i.id === threadId);
      if (found) return found.idx;
    }
    return undefined;
  }, [groupedThreads, threadId]);

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.modelName.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q),
    );
  }, [models, modelQuery]);

  return (
    <header className="flex h-12 shrink-0 items-center px-2">
      <div className="flex w-full flex-row items-center justify-between">
        {" "}
        <div className="flex min-w-0 flex-row items-center gap-1">
          <SidebarTrigger />
          {/* Thread switcher — Header.tsx, real data */}
          <DropdownMenu>
            <DropdownTrigger
              render={
                <Button
                  variant="ghost"
                  trailingIcon={ChevronsUpDown}
                  className="min-w-0 "
                >
                  {/* <group> · <thread> variant — truncate so a long title
                      clips with an ellipsis instead of stretching the header */}
                  <span className="">
                    {current?.title || "Select a thread"}
                  </span>
                </Button>
              }
            />
            <DropdownContent
              side="bottom"
              align="start"
              sideOffset={6}
              checkedIndex={currentIdx}
            >
              <DropdownSearch
                value={query}
                onValueChange={setQuery}
                placeholder="Search threads"
              />
              {groupedThreads.length === 0 ? (
                <DropdownEmpty>No threads found</DropdownEmpty>
              ) : (
                <>
                  {groupedThreads.map((group) => (
                    <Fragment key={group.key}>
                      <DropdownLabel>{group.label}</DropdownLabel>
                      {group.items.map((item) => {
                        const thread = threads.find((t) => t.id === item.id);
                        const activity = relativeTime(thread?.lastMessageAt);
                        return (
                          <MenuItem
                            key={item.id}
                            index={item.idx}
                            truncate
                            label={item.title}
                            trailing={activity}
                            checked={item.id === threadId ? true : undefined}
                            onSelect={() => {
                              if (item.id !== threadId) {
                                router.push(
                                  `/workspace/${workspaceId}/${item.id}`,
                                );
                              }
                            }}
                          />
                        );
                      })}
                    </Fragment>
                  ))}
                </>
              )}
            </DropdownContent>
          </DropdownMenu>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-1">
          <div className="flex flex-col items-end gap-1">
            {runError && (
              <span className="text-xs text-destructive">{runError}</span>
            )}
            {onRun && (
              <Button
                variant="ghost"
                leadingIcon={isRunning ? Stop : Play}
                onClick={onRun}
                disabled={isRunning}
              >
                {isRunning ? "Running…" : "Run"}
              </Button>
            )}
          </div>
          {/* Model picker */}
          <DropdownMenu>
            <DropdownTrigger
              render={
                <Button
                  variant="ghost"
                  aria-label="Select model"
                  trailingIcon={ChevronsUpDown}
                  // Cap the picker so "Model · Provider" never stretches the
                  // header row; the label truncates with an ellipsis.
                  className=" justify-between"
                >
                  <span className="">
                    {selectedModel
                      ? `${selectedModel.modelName} · ${selectedModel.providerName}`
                      : "Select model"}
                  </span>
                </Button>
              }
            />
            <DropdownContent side="bottom" align="end" sideOffset={6}>
              <DropdownSearch
                value={modelQuery}
                onValueChange={setModelQuery}
                placeholder="Search models…"
              />
              {filteredModels.length === 0 ? (
                <DropdownEmpty>
                  No models — add a provider in Settings
                </DropdownEmpty>
              ) : (
                filteredModels.map((model, index) => (
                  <MenuItem
                    key={`${model.providerSlug}:${model.modelId}`}
                    index={index}
                    truncate
                    label={`${model.modelName} · ${model.providerName}`}
                    checked={
                      selectedModel?.providerSlug === model.providerSlug &&
                      selectedModel?.modelId === model.modelId
                        ? true
                        : undefined
                    }
                    onSelect={() => onSelectModel(model)}
                  />
                ))
              )}
            </DropdownContent>
          </DropdownMenu>{" "}
          <Button size="icon" variant="ghost" onClick={onOpenSettings}>
            <Sliders />
          </Button>
        </div>
      </div>
    </header>
  );
}
