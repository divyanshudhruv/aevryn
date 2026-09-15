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
import { useEffect, useMemo, useState } from "react";
import { useIcon } from "@aevryn/ui/lib/icon-context";

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
      const { data, error } = await supabase
        .from("threads")
        .select("id, title, group_id")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null);
      if (error) {
        console.error("[workspace-header] load threads failed", error);
        return;
      }
      if (!cancelled && data) {
        setThreads(
          data.map((t: Record<string, unknown>) => ({
            id: t.id as string,
            title: (t.title as string) || "Untitled",
            groupId: (t.group_id as string | null) ?? null,
          })),
        );
      }
    }

    async function fetchGroups() {
      const { data, error } = await supabase
        .from("groups")
        .select("id, name")
        .eq("workspace_id", workspaceId);
      if (error) {
        console.error("[workspace-header] load groups failed", error);
        return;
      }
      if (!cancelled && data) {
        setGroups(
          data.map((g: Record<string, unknown>) => ({
            id: g.id as string,
            name: g.name as string,
          })),
        );
      }
    }

    void fetchGroups();

    void fetchThreads();

    const channel = supabase
      .channel(`threads:header:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "threads",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: {
          eventType?: string;
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        }) => {
          const row = payload.new ?? payload.old;
          if (!row?.id) return;
          setThreads((prev) => {
            const byId = new Map(prev.map((t) => [t.id, t]));
            if (payload.eventType === "DELETE" || row.deleted_at) {
              byId.delete(row.id as string);
            } else {
              byId.set(row.id as string, {
                id: row.id as string,
                title: (row.title as string) || "Untitled",
                groupId: (row.group_id as string | null) ?? null,
              });
            }
            return Array.from(byId.values());
          });
        },
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBE_ERROR" || status === "CHANNEL_ERROR") {
          console.error("[workspace-header] threads channel failed", status);
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
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
    <header className="flex h-12 shrink-0 items-center px-4">
      <div className="flex w-full flex-row items-center justify-between">
        {" "}
        <div className="flex min-w-0 flex-row items-center gap-px">
          {/* Thread switcher — Header.tsx, real data */}
          <DropdownMenu>
            <DropdownTrigger
              render={
                <Button variant="ghost" trailingIcon={ChevronsUpDown}>
                  {/* <group> · <thread> variant */}
                  {current?.title || "Select a thread"}
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
              {threads.length === 0 ? (
                <DropdownEmpty>No threads found</DropdownEmpty>
              ) : (
                <>
                  {groupedThreads.map((group) => (
                    <DropdownLabel key={group.key}>
                      {group.label}
                    </DropdownLabel>
                  ))}
                  {groupedThreads.flatMap((group) =>
                    group.items.map((item) => (
                      <MenuItem
                        key={item.id}
                        index={item.idx}
                        label={item.title}
                        checked={item.id === threadId ? true : undefined}
                        onSelect={() => {
                          if (item.id !== threadId) {
                            router.push(`/workspace/${workspaceId}/${item.id}`);
                          }
                        }}
                      />
                    )),
                  )}
                </>
              )}
            </DropdownContent>
          </DropdownMenu>

        </div>
        <div className="flex shrink-0 flex-row items-center gap-2">
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
          {/* Model picker */}
          <DropdownMenu>
            <DropdownTrigger
              render={
                <Button
                  variant="ghost"
                  aria-label="Select model"
                  className="w-56 justify-between"
                  trailingIcon={ChevronsUpDown}
                >
                  {selectedModel
                    ? `${selectedModel.modelName} · ${selectedModel.providerName}`
                    : "Select model"}
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
