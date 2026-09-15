"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupActions,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuActions,
  type SidebarProps,
  SidebarMenuSkeleton,
} from "@aevryn/ui/components/ui/sidebar";
import { Tooltip } from "@aevryn/ui/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSeparator,
} from "@aevryn/ui/components/ui/dropdown";
import { MenuItem } from "@aevryn/ui/components/ui/menu-item";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import {
  SidebarWorkspaceHeader,
  WorkspaceTile,
} from "@aevryn/ui/components/sidebar-app/workspace-header";
import { SidebarUserFooter } from "@aevryn/ui/components/sidebar-app/user-footer";
import { SidebarSearchField } from "@aevryn/ui/components/sidebar-app/search-field";
import {
  Card,
  CardImage,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@aevryn/ui/components/card";
import {
  surfaceClasses,
  surfaceHoverClasses,
} from "@aevryn/ui/lib/surface-classes";
import { useSurface } from "@aevryn/ui/lib/surface-context";
import { AnimatePresence, motion as m } from "framer-motion";
import { spring } from "@aevryn/ui/lib/springs";
import { CommandMenuDemo } from "../command-menu-demo";
import type { RunStatus } from "@aevryn/db";
import { SettingsDialog } from "../dialog/settings-dialog";
import { NewGroupDialog } from "../dialog/new-group-dialog";
import { ConfirmDeleteDialog } from "../dialog/confirm-delete-dialog";
import { RenameThreadDialog } from "../dialog/rename-thread-dialog";
import { RenameGroupDialog } from "../dialog/rename-group-dialog";
import { Badge } from "../ui/badge";
export interface PromoCard {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
}

/** Shown only while the callouts table has no visible rows. */
const FALLBACK_CALLOUTS: PromoCard[] = [
  {
    id: "fallback-1",
    title: "Aevryn is here",
    description: "An agent that shows its work",
    imageUrl: null,
  },
  {
    id: "fallback-2",
    title: "Bring your own key",
    description: "Groq and any OpenAI-compatible API",
    imageUrl: null,
  },
  {
    id: "fallback-3",
    title: "Live web answers",
    description: "Search, scrape, crawl, and visibility",
    imageUrl: null,
  },
];

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Cdefs%3E%3CradialGradient id='a' cx='12%25' cy='16%25' r='70%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.9'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='b' cx='90%25' cy='12%25' r='65%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.45'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='c' cx='82%25' cy='94%25' r='75%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.8'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='d' cx='24%25' cy='90%25' r='68%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.55'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='320' height='180' fill='%23ffffff'/%3E%3Crect width='320' height='180' fill='%236B97FF' fill-opacity='0.2'/%3E%3Crect width='320' height='180' fill='url(%23a)'/%3E%3Crect width='320' height='180' fill='url(%23b)'/%3E%3Crect width='320' height='180' fill='url(%23c)'/%3E%3Crect width='320' height='180' fill='url(%23d)'/%3E%3C/svg%3E";

export interface SidebarData {
  workspace: { id: string; name: string; isDefault: boolean };
  workspaces: Array<{ id: string; name: string; isDefault: boolean }>;
  groups: Array<{ id: string; name: string; position: number }>;
  threads: Array<{
    id: string;
    groupId: string | null;
    title: string;
    status: string;
    updatedAt: string;
    boundWorkflowId: string | null;
  }>;
  userName: string | null;
  userAvatarUrl: string | null;
  promoCards: PromoCard[];
}

export interface AppSidebarProps extends Omit<SidebarProps, "children"> {
  /** Sidebar data from /api/sidebar. Omitted → skeleton shown. */
  data?: SidebarData;
  /** Thread id of the currently open conversation, for the active row. */
  activeThreadId?: string;
  onCreateGroup?: (workspaceId: string, name: string) => void;
  onCreateThread?: (
    workspaceId: string,
    groupId: string | null,
    title: string,
  ) => void;
  onOpenThread?: (workspaceId: string, threadId: string) => void;
  onSwitchWorkspace?: (workspaceId: string) => void;
  /** Called after the settings dialog renames or deletes a workspace. */
  onWorkspaceMutated?: () => void;
  onRenameThread?: (threadId: string, title: string) => void;
  onDeleteThread?: (threadId: string) => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  /** Run a single thread's bound workflow. */
  onRunThread?: (threadId: string) => void;
  /** Stop a running thread. */
  onStopThread?: (threadId: string) => void;
  /** Run every runnable thread in a section (has a bound workflow, not running). */
  onRunAll?: (threadIds: string[]) => void;
  /** Stop every active thread in a section. */
  onStopAll?: (threadIds: string[]) => void;
  onLogout?: () => void;
}

export function AppSidebar({
  data,
  activeThreadId,
  onCreateGroup,
  onCreateThread,
  onOpenThread,
  onSwitchWorkspace,
  onWorkspaceMutated,
  onRenameThread,
  onDeleteThread,
  onRenameGroup,
  onDeleteGroup,
  onRunThread,
  onStopThread,
  onRunAll,
  onStopAll,
  onLogout,
  ...props
}: AppSidebarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [callouts, setCallouts] = useState<PromoCard[]>(FALLBACK_CALLOUTS);

  // Real callouts come from the callouts table via /api/sidebar. Empty table =
  // fall back to the three promo cards.
  const promoSource =
    data?.promoCards && data.promoCards.length > 0
      ? data.promoCards
      : FALLBACK_CALLOUTS;
  const promoKey = promoSource.map((c) => c.id).join("|");
  useEffect(() => {
    setCallouts((prev) =>
      prev.length === promoSource.length && promoSource.every((c, i) => c.id === prev[i]?.id)
        ? prev
        : promoSource,
    );
  }, [promoKey]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 0);
    return () => clearTimeout(timer);
  }, [search]);
  const dismiss = (id: string) => setCallouts((c) => c.filter((x) => x.id !== id));
  // The callout rests one surface step above the rail.
  const level = Math.min(useSurface() + 1, 8);
  // Front card's measured height — never an animated "auto".
  const [cardH, setCardH] = useState(64);
  const collapsedH = cardH + Math.min(callouts.length - 1, 2) * 12;
  const PlusIcon = useIcon("plus");
  const PencilIcon = useIcon("pencil");
  const MoreVerticalIcon = useIcon("more-vertical");
  const LinkIcon = useIcon("link");
  const SlidersIcon = useIcon("sliders-horizontal");
  const UserIcon = useIcon("user");
  const ArrowLeftIcon = useIcon("arrow-left");
  const FooterSettingsIcon = useIcon("settings");
  const MoonIcon = useIcon("moon");
  const BellIcon = useIcon("bell");
  const CommandIcon = useIcon("command");
  const PlayIcon = useIcon("play");
  const StopIcon = useIcon("stop");
  const DustbinIcon = useIcon("dustbin");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [renameThreadOpen, setRenameThreadOpen] = useState(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [renameThreadTarget, setRenameThreadTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "thread"; id: string; name: string }
    | { kind: "group"; id: string; name: string }
    | null
  >(null);

  const { resolvedTheme, setTheme } = useTheme();

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  const handleThemeToggle = useCallback(() => {
    setTheme(nextTheme);
  }, [nextTheme, setTheme]);

  // Map the real workspace data into the sidebar's group/thread sections.
  const sections = useMemo(() => {
    if (!data) return null;
    const byGroup = new Map<string | null, SidebarData["threads"]>();
    for (const thread of data.threads) {
      const list = byGroup.get(thread.groupId ?? null) ?? [];
      list.push(thread);
      byGroup.set(thread.groupId ?? null, list);
    }
    const result: Array<{
      id: string | null;
      label: string;
      items: SidebarData["threads"];
    }> = data.groups.map((group) => ({
      id: group.id,
      label: group.name,
      items: byGroup.get(group.id) ?? [],
    }));
    const ungrouped = byGroup.get(null) ?? [];
    if (ungrouped.length > 0) {
      result.unshift({ id: null, label: "THREADS", items: ungrouped });
    }
    return result;
  }, [data]);

  const query = debouncedSearch.toLowerCase();
  const filteredSections = useMemo(() => {
    if (query === "" || !sections) return null;
    return sections.map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.title.toLowerCase().includes(query),
      ),
    }));
  }, [sections, query]);

  const deleteItems = useMemo(() => {
    if (!deleteTarget) return [];
    if (deleteTarget.kind === "thread") return [{ value: deleteTarget.name }];
    return (sections?.find((s) => s.id === deleteTarget.id)?.items ?? []).map(
      (t) => ({ value: t.title }),
    );
  }, [deleteTarget, sections]);

  const currentWorkspace = data?.workspace;
  const currentWorkspaceIndex = useMemo(
    () =>
      currentWorkspace
        ? Math.max(
            0,
            (data?.workspaces ?? []).findIndex(
              (w) => w.id === currentWorkspace.id,
            ),
          )
        : 0,
    [currentWorkspace, data?.workspaces],
  );

  return (
    <>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspace={currentWorkspace}
        onWorkspaceMutated={onWorkspaceMutated}
      />

      <NewGroupDialog
        key={`new-group-${newGroupOpen}`}
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        onConfirm={(name) => {
          if (currentWorkspace) onCreateGroup?.(currentWorkspace.id, name);
          setNewGroupOpen(false);
        }}
      />
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={
          deleteTarget?.kind === "group" ? "Delete group" : "Delete thread"
        }
        description={
          deleteTarget?.kind === "group"
            ? "All threads in this group will be removed."
            : "This thread will be permanently removed."
        }
        actionLabel={deleteTarget?.kind === "group" ? "Delete group" : "Delete"}
        items={deleteItems}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.kind === "group") {
            onDeleteGroup?.(deleteTarget.id);
          } else {
            onDeleteThread?.(deleteTarget.id);
          }
          setConfirmDeleteOpen(false);
        }}
      />
      <RenameThreadDialog
        key={`rename-thread-${renameThreadTarget?.id ?? "none"}-${renameThreadOpen}`}
        open={renameThreadOpen}
        onOpenChange={setRenameThreadOpen}
        title={renameThreadTarget?.title}
        onRename={(title) => {
          if (renameThreadTarget)
            onRenameThread?.(renameThreadTarget.id, title);
          setRenameThreadOpen(false);
        }}
      />
      <RenameGroupDialog
        key={`rename-group-${renameGroupTarget?.id ?? "none"}-${renameGroupOpen}`}
        open={renameGroupOpen}
        onOpenChange={setRenameGroupOpen}
        name={renameGroupTarget?.name}
        onRename={(name) => {
          if (renameGroupTarget) onRenameGroup?.(renameGroupTarget.id, name);
          setRenameGroupOpen(false);
        }}
      />
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <SidebarWorkspaceHeader
            name={currentWorkspace?.name ?? "Workspace"}
            tile={
              <WorkspaceTile>
                {currentWorkspace?.name?.[0] ?? "W"}
              </WorkspaceTile>
            }
            checkedIndex={currentWorkspaceIndex}
            menu={
              <>
                {(data?.workspaces ?? []).map((workspace, index) => (
                  <MenuItem
                    key={workspace.id}
                    index={index}
                    label={workspace.name}
                    checked={workspace.id === currentWorkspace?.id}
                    onSelect={() => onSwitchWorkspace?.(workspace.id)}
                  />
                ))}
                <MenuItem
                  index={data?.workspaces.length ?? 0}
                  icon={PlusIcon}
                  label="New workspace" disabled
                  onSelect={() => {}}
                />
              </>
            }
          />
          {/* search + action rows are ONE block on the menu rows' rhythm */}
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-col gap-1">
              {" "}
              <SidebarSearchField
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {/* {search !== "" && (
                <div className="">
                  <Badge size="sm">
                    {threadCount} {threadCount === 1 ? "thread" : "threads"}{" "}
                    found
                  </Badge>
                </div>
              )} */}
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  icon={PlusIcon}
                  onClick={() => setNewGroupOpen(true)}
                >
                  New
                  {/* shortcut chip, revealed on row hover */}
                  <span className="ml-auto inline-flex opacity-0 transition-opacity duration-80 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100">
                    <kbd className="font-sans text-[11px] text-muted-foreground">
                      ⇧⌘O
                    </kbd>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton icon={BellIcon}>
                  Notifications {/* shortcut chip, revealed on row hover */}
                  <span className="ml-auto inline-flex ">
                    {" "}
                    <Badge color="blue" size="sm">
                      0
                    </Badge>
                    {/* <kbd className="font-sans text-[11px] text-muted-foreground">
                    </kbd> */}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton icon={CommandIcon}>
                  Commands
                  {/* shortcut chip, revealed on row hover */}
                  <span className="ml-auto inline-flex">
                    <kbd className="font-sans text-[11px] text-muted-foreground">
                      <CommandMenuDemo />
                    </kbd>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {sections === null && (
            <>
              <SidebarMenuSkeleton />
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton />
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton />
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton showIcon />
            </>
          )}
          {sections !== null && sections.length === 0 && (
            <div className="flex flex-col gap-1 px-4 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                No groups yet
              </p>
              <p className="text-xs text-muted-foreground">
                Create your first group to organize threads.
              </p>
            </div>
          )}
          {(filteredSections ?? sections ?? []).map((section) => (
            <SidebarGroup key={section.id ?? section.label} collapsible>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupActions>
                <Tooltip content="Add item" side="top">
                  <SidebarGroupAction
                    aria-label="Add thread"
                    onClick={() => {
                      if (currentWorkspace) {
                        onCreateThread?.(
                          currentWorkspace.id,
                          section.id,
                          "New thread",
                        );
                      }
                    }}
                  >
                    <PlusIcon />
                  </SidebarGroupAction>
                </Tooltip>

                <Tooltip content="Section settings" side="top">
                  <DropdownMenu>
                    <DropdownTrigger
                      render={
                        <SidebarGroupAction aria-label="Section settings">
                          <SlidersIcon />
                        </SidebarGroupAction>
                      }
                    />
                    {/* 240px — the header/footer trigger width */}
                    <DropdownContent
                      className="min-w-0 w-[240px]"
                      align="start"
                      sideOffset={4}
                    >
                      <MenuItem
                        index={0}
                        icon={PlayIcon}
                        label={"Run All"}
                        onSelect={() => {
                          const runnable = section.items
                            .filter(
                              (item) =>
                                item.boundWorkflowId != null &&
                                item.status !== "running" &&
                                item.status !== "awaiting_approval",
                            )
                            .map((item) => item.id);
                          if (runnable.length > 0) onRunAll?.(runnable);
                        }}
                      />
                      <MenuItem
                        index={1}
                        icon={StopIcon}
                        label={"Stop All"}
                        disabled={
                          !section.items.some((item) =>
                            [
                              "running",
                              "sleeping",
                              "waiting_for_approval",
                            ].includes(item.status),
                          )
                        }
                        onSelect={() => {
                          const active = section.items
                            .filter((item) =>
                              [
                                "running",
                                "sleeping",
                                "waiting_for_approval",
                              ].includes(item.status),
                            )
                            .map((item) => item.id);
                          if (active.length > 0) onStopAll?.(active);
                        }}
                      />
                      <MenuItem
                        index={2}
                        icon={PencilIcon}
                        label="Rename Group"
                        disabled={section.id === null}
                        onSelect={() => {
                          if (section.id === null) return;
                          setRenameGroupTarget({
                            id: section.id,
                            name: section.label,
                          });
                          setRenameGroupOpen(true);
                        }}
                      />

                      <DropdownSeparator />
                      <MenuItem
                        index={3}
                        icon={DustbinIcon}
                        label="Delete Group"
                        disabled={section.id === null}
                        onSelect={() => {
                          if (section.id === null) return;
                          setDeleteTarget({
                            kind: "group",
                            id: section.id,
                            name: section.label,
                          });
                          setConfirmDeleteOpen(true);
                        }}
                      />
                    </DropdownContent>
                  </DropdownMenu>
                </Tooltip>
              </SidebarGroupActions>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    {/* status drives the dot and the screen-reader "unread" text */}
                    <SidebarMenuButton
                      status={item.status as RunStatus}
                      isActive={item.id === (activeThreadId ?? activeId)}
                      onClick={() => {
                        setActiveId(item.id);
                        if (data) onOpenThread?.(data.workspace.id, item.id);
                      }}
                    >
                      {item.title}
                    </SidebarMenuButton>
                    <SidebarMenuActions showOnHover>
                      {item.status !== "awaiting_approval" && (
                        <Tooltip
                          content={item.status === "running" ? "Stop" : "Run"}
                          side="top"
                        >
                          <SidebarMenuAction
                            aria-label="Run/Stop"
                            onClick={() => {
                              if (item.status === "running") {
                                onStopThread?.(item.id);
                              } else if (item.boundWorkflowId != null) {
                                onRunThread?.(item.id);
                              }
                            }}
                          >
                            {item.status === "running" ? (
                              <StopIcon />
                            ) : (
                              <PlayIcon />
                            )}
                          </SidebarMenuAction>
                        </Tooltip>
                      )}
                      <Tooltip content="Rename" side="top">
                        <SidebarMenuAction
                          aria-label="Rename"
                          onClick={() => {
                            setRenameThreadTarget({
                              id: item.id,
                              title: item.title,
                            });
                            setRenameThreadOpen(true);
                          }}
                        >
                          <PencilIcon />
                        </SidebarMenuAction>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownTrigger
                          render={
                            <SidebarMenuAction aria-label="More options">
                              <MoreVerticalIcon />
                            </SidebarMenuAction>
                          }
                        />
                        {/* 240px — the header/footer trigger width */}
                        <DropdownContent
                          className="min-w-0 w-[240px]"
                          align="start"
                          sideOffset={4}
                        >
                          <MenuItem
                            index={0}
                            icon={
                              item.status === "running" ? StopIcon : PlayIcon
                            }
                            label={item.status === "running" ? "Stop" : "Run"}
                            onSelect={() => {
                              if (item.status === "running") {
                                onStopThread?.(item.id);
                              } else if (item.boundWorkflowId != null) {
                                onRunThread?.(item.id);
                              }
                            }}
                            disabled={
                              item.status === "awaiting_approval" ||
                              (item.status !== "running" &&
                                item.boundWorkflowId == null)
                            }
                          />

                          <MenuItem
                            index={2}
                            icon={PencilIcon}
                            label="Rename"
                            onSelect={() => {
                              setRenameThreadTarget({
                                id: item.id,
                                title: item.title,
                              });
                              setRenameThreadOpen(true);
                            }}
                          />
                          <MenuItem
                            index={3}
                            icon={LinkIcon}
                            label="Share"
                            disabled
                            onSelect={() => {}}
                          />
                          <DropdownSeparator />
                          <MenuItem
                            index={4}
                            icon={DustbinIcon}
                            label="Delete"
                            onSelect={() => {
                              setDeleteTarget({
                                kind: "thread",
                                id: item.id,
                                name: item.title,
                              });
                              setConfirmDeleteOpen(true);
                            }}
                          />
                        </DropdownContent>
                      </DropdownMenu>
                    </SidebarMenuActions>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          {/* sonner-style pile: cards peek 12px apiece behind the front one,
            scaling 0.05 a step, two peeks max */}
          <m.div
            className="relative"
            animate={{ height: callouts.length === 0 ? 0 : collapsedH }}
            transition={{ ...spring.moderate, bounce: 0 }}
          >
            <AnimatePresence initial={false}>
              {callouts.map((c, i) => (
                <m.div
                  key={c.id}
                  className="absolute inset-x-0 bottom-0"
                  style={{ transformOrigin: "bottom center", zIndex: 100 - i }}
                  initial={{ opacity: 0, y: 14, scale: 0.96 }}
                  animate={{
                    y: -Math.min(i, 2) * 12,
                    scale: 1 - Math.min(i, 2) * 0.05,
                    opacity: i <= 2 ? 1 : 0,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.9,
                    transition: { duration: 0.12 },
                  }}
                  transition={spring.moderate}
                  ref={
                    i === 0
                      ? (el) => {
                          if (el) setCardH(el.offsetHeight);
                        }
                      : undefined
                  }
                >
                  <Card
                    size="compact"
                    dismissible
                    onDismiss={() => dismiss(c.id)}
                    label={`${c.title} - ${c.description}`}
                    className={`rounded-xl overflow-hidden min-h-0 transition-[background-color,box-shadow]
                  duration-80 ${surfaceClasses(level, 2)} ${surfaceHoverClasses(level + 1, 3)}
                  shadow-(--shadow-2-inset) hover:shadow-(--shadow-3-inset)`}
                  >
                    {/* swap for your artwork */}
                    <CardImage
                      src={c.imageUrl ?? FALLBACK_IMG}
                      className="aspect-[2/1] max-h-28"
                    />
                    <CardHeader className="gap-0 pt-3">
                      <CardTitle className="truncate">{c.title}</CardTitle>
                      <CardDescription className="truncate text-caption text-muted-foreground">
                        {c.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </m.div>
              ))}
            </AnimatePresence>
          </m.div>
          {/* vertical: actions stack above the user row */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                icon={FooterSettingsIcon}
                onClick={() => setSettingsOpen(true)}
              >
                Global Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton icon={MoonIcon} onClick={handleThemeToggle}>
                Toggle Theme
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarUserFooter
            name={data?.userName ?? "User"}
            avatar={
              data?.userAvatarUrl ? (
                <img
                  src={data.userAvatarUrl}
                  alt={data?.userName ?? "User"}
                  referrerPolicy="no-referrer"
                  className="size-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-5 items-center justify-center rounded-full bg-muted-foreground text-[10px] text-background">
                  {(data?.userName ?? "U")[0]}
                </span>
              )
            }
            menu={
              <>
                <MenuItem index={0} icon={UserIcon} label="Profile" disabled />

                <MenuItem
                  index={2}
                  icon={ArrowLeftIcon}
                  label="Log out"
                  onSelect={() => onLogout?.()}
                />
              </>
            }
          />
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
