"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "@aevryn/ui/components/ui/card";
import {
  surfaceClasses,
  surfaceHoverClasses,
} from "@aevryn/ui/lib/surface-classes";
import { useSurface } from "@aevryn/ui/lib/surface-context";
import { useSidebarData } from "./use-sidebar-data";
import { SettingsDialog } from "../dialog/settings-dialog";
import { PlayIcon } from "lucide-react";
import { WorkflowDelConfirmationDialog } from "../dialog/workflow-del-confirmation-dialog";
import { EntityActionDialog } from "../dialog/entity-action-dialog";
import { ConfirmDeleteDialog } from "../dialog/confirm-delete-dialog";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { WorkflowDialog } from "../dialog/workflow-dialog";
import { NewGroupDialog } from "../dialog/new-group-dialog";
import { NewThreadDialog } from "../dialog/new-thread-dialog";
import type { WorkflowSectionId } from "../dialog/workflow-sections";
import { getBrowserSupabase } from "@aevryn/auth";

const CALLOUTS = [
  { id: 1, title: "Aurora 2 is here", desc: "Longer context, faster agents" },
];

export function AppSidebar({
  workspaceId,
  ...props
}: Omit<SidebarProps, "children"> & { workspaceId: string }) {
  const router = useRouter();
  const routeParams = useParams<{ workspaceId: string; threadId?: string }>();

  // Real data: user identity, all workspaces, and the current workspace's
  // groups + threads (fetched from Supabase, RLS-scoped to the user).
  const { user, workspaces, groups, loading, refetch } =
    useSidebarData(workspaceId);

  const activeWorkspace =
    workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? null;

  // Keep the active-thread highlight in sync with the URL so a direct
  // navigational visit (or a browser back/forward) lights up the right row.
  const [activeThread, setActiveThread] = useState<string | null>(
    routeParams.threadId ?? null,
  );
  useEffect(() => {
    setActiveThread(routeParams.threadId ?? null);
  }, [routeParams.threadId]);
  const [callouts, setCallouts] = useState(CALLOUTS);
  const dismiss = (id: number) =>
    setCallouts((c) => c.filter((x) => x.id !== id));
  // The callout rests one surface step above the rail.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workflowDeleteOpen, setWorkflowDeleteOpen] = useState<
    [boolean, boolean]
  >([false, false]);
  const [workflowDeleteLoading, setWorkflowDeleteLoading] = useState<
    [boolean, boolean]
  >([false, false]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [sectionRenameOpen, setSectionRenameOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [pendingThreadGroupId, setPendingThreadGroupId] = useState<
    string | null
  >(null);

  // Rename dialog target state.
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renamingThreadTitle, setRenamingThreadTitle] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingGroupName, setRenamingGroupName] = useState("");
  const [renamingThreadLoading, setRenamingThreadLoading] = useState(false);
  const [renamingGroupLoading, setRenamingGroupLoading] = useState(false);

  // Permanent-delete confirmation dialogs.
  const [deleteThreadOpen, setDeleteThreadOpen] = useState(false);
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);
  const [deleteThreadTitle, setDeleteThreadTitle] = useState("");
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [deleteGroupName, setDeleteGroupName] = useState("");
  const [deleteGroupThreadsOpen, setDeleteGroupThreadsOpen] = useState(false);
  const [deleteGroupThreadsId, setDeleteGroupThreadsId] = useState<
    string | null
  >(null);
  const [deleteGroupThreadsList, setDeleteGroupThreadsList] = useState<
    Array<{ value: string }>
  >([]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [workflowDialogOpen, setWorkflowDialogOpen] = useState<
    [boolean, string]
  >([false, "general"]);
  const level = Math.min(useSurface() + 1, 8);
  const PlusIcon = useIcon("plus");
  const PencilIcon = useIcon("pencil");
  const MoreVerticalIcon = useIcon("more-vertical");
  const LinkIcon = useIcon("link");
  const SlidersIcon = useIcon("sliders-horizontal");
  const UserIcon = useIcon("user");
  const ArrowLeftIcon = useIcon("arrow-left");
  const FooterSettingsIcon = useIcon("settings");
  const MoonIcon = useIcon("moon");
  const SunIcon = useIcon("sun");
  const BellIcon = useIcon("bell");
  const DeleteIcon = useIcon("dustbin");
  const StopIcon = useIcon("stop");

  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : false;

  const openThread = (workspaceId_: string, threadId: string) => {
    setActiveThread(threadId);
    router.push(`/workspace/${workspaceId_}/${threadId}`);
  };

  const supabaseForMutations = () => getBrowserSupabase();

  const confirmDeleteThread = (threadId: string, title: string) => {
    setDeleteThreadId(threadId);
    setDeleteThreadTitle(title);
    setDeleteThreadOpen(true);
  };

  const handleDeleteThread = async (setLoading?: (v: boolean) => void) => {
    if (!deleteThreadId) return;
    setLoading?.(true);
    try {
      const supabase = supabaseForMutations();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("threads")
        .delete()
        .eq("id", deleteThreadId)
        .eq("user_id", user.id);
      setDeleteThreadOpen(false);
      setDeleteThreadId(null);
      refetch();
    } finally {
      setLoading?.(false);
    }
  };

  const confirmDeleteGroup = (groupId: string, name: string) => {
    setDeleteGroupId(groupId);
    setDeleteGroupName(name);
    setDeleteGroupOpen(true);
  };

  const confirmDeleteGroupThreads = (
    groupId: string,
    _groupName: string,
    threads: Array<{ value: string }>,
  ) => {
    setDeleteGroupThreadsId(groupId);
    setDeleteGroupThreadsList(threads);
    setDeleteGroupThreadsOpen(true);
  };

  const handleDeleteGroupThreads = async (
    setLoading?: (v: boolean) => void,
  ) => {
    if (!deleteGroupThreadsId) return;
    setLoading?.(true);
    try {
      const supabase = supabaseForMutations();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("threads")
        .delete()
        .eq("group_id", deleteGroupThreadsId)
        .eq("user_id", user.id);
      setDeleteGroupThreadsOpen(false);
      setDeleteGroupThreadsId(null);
      setDeleteGroupThreadsList([]);
      refetch();
    } finally {
      setLoading?.(false);
    }
  };

  const handleDeleteGroup = async (setLoading?: (v: boolean) => void) => {
    if (!deleteGroupId) return;
    setLoading?.(true);
    try {
      const supabase = supabaseForMutations();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("threads")
        .delete()
        .eq("group_id", deleteGroupId)
        .eq("user_id", user.id);
      await supabase
        .from("groups")
        .delete()
        .eq("id", deleteGroupId)
        .eq("user_id", user.id);
      setDeleteGroupOpen(false);
      setDeleteGroupId(null);
      refetch();
    } finally {
      setLoading?.(false);
    }
  };

  const handleRenameThread = async (newTitle: string) => {
    if (!renamingThreadId || !newTitle.trim()) return;
    setRenamingThreadLoading(true);
    try {
      const supabase = supabaseForMutations();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("threads")
        .update({ title: newTitle.trim() })
        .eq("id", renamingThreadId)
        .eq("user_id", user.id);
      setRenameOpen(false);
      setRenamingThreadId(null);
      setRenamingThreadTitle("");
      refetch();
    } finally {
      setRenamingThreadLoading(false);
    }
  };

  const handleRenameGroup = async (newName: string) => {
    if (!renamingGroupId || !newName.trim()) return;
    setRenamingGroupLoading(true);
    try {
      const supabase = supabaseForMutations();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("groups")
        .update({ name: newName.trim() })
        .eq("id", renamingGroupId)
        .eq("user_id", user.id);
      setSectionRenameOpen(false);
      setRenamingGroupId(null);
      setRenamingGroupName("");
      refetch();
    } finally {
      setRenamingGroupLoading(false);
    }
  };

  const openRenameThread = (threadId: string, title: string) => {
    setRenamingThreadId(threadId);
    setRenamingThreadTitle(title);
    setRenameOpen(true);
  };

  const openRenameGroup = (groupId: string, name: string) => {
    setRenamingGroupId(groupId);
    setRenamingGroupName(name);
    setSectionRenameOpen(true);
  };

  return (
    <Sidebar rail={false} bordered={false} variant="inset" {...props}>
      {" "}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <NewGroupDialog
        open={newGroupOpen}
        onOpenChange={(open) => {
          setNewGroupOpen(open);
          if (!open) {
            setPendingThreadGroupId(null);
          }
        }}
        workspaceId={activeWorkspace?.id || ""}
        icon={PlusIcon}
        onCreateSuccess={() => {
          setNewGroupOpen(false);
          refetch();
        }}
      />
      <NewThreadDialog
        open={newThreadOpen}
        onOpenChange={(open) => {
          setNewThreadOpen(open);
          if (!open) {
            setPendingThreadGroupId(null);
          }
        }}
        workspaceId={activeWorkspace?.id || ""}
        groupId={pendingThreadGroupId ?? ""}
        icon={PlusIcon}
        onCreateSuccess={() => {
          setNewThreadOpen(false);
          setPendingThreadGroupId(null);
          refetch();
        }}
      />
      <WorkflowDelConfirmationDialog
        open={workflowDeleteOpen[0]}
        onOpenChange={(open) => {
          setWorkflowDeleteOpen([open, workflowDeleteOpen[1]]);
        }}
        mode="delete-all"
        loading={workflowDeleteLoading[0]}
      />
      <WorkflowDelConfirmationDialog
        open={workflowDeleteOpen[1]}
        onOpenChange={(open) => {
          setWorkflowDeleteOpen([workflowDeleteOpen[0], open]);
        }}
        loading={workflowDeleteLoading[1]}
      />
      <ConfirmDeleteDialog
        open={deleteThreadOpen}
        onOpenChange={(open) => {
          setDeleteThreadOpen(open);
          if (!open) {
            setDeleteThreadId(null);
            setDeleteThreadTitle("");
          }
        }}
        title="Delete thread"
        description="This thread and everything tied to it will be permanently removed. This action cannot be undone."
        actionLabel="Delete thread"
        items={[{ value: deleteThreadTitle }]}
        onConfirm={() => handleDeleteThread(setDeleteLoading)}
        loading={deleteLoading}
      />
      <ConfirmDeleteDialog
        open={deleteGroupOpen}
        onOpenChange={(open) => {
          setDeleteGroupOpen(open);
          if (!open) {
            setDeleteGroupId(null);
            setDeleteGroupName("");
          }
        }}
        title="Delete section"
        description="This section, its threads, and all workflow bindings will be permanently removed. Threads that are not in this section are not affected. This action cannot be undone."
        actionLabel="Delete section"
        items={[{ value: deleteGroupName }]}
        onConfirm={() => handleDeleteGroup(setDeleteLoading)}
        loading={deleteLoading}
      />
      <ConfirmDeleteDialog
        open={deleteGroupThreadsOpen}
        onOpenChange={(open) => {
          setDeleteGroupThreadsOpen(open);
          if (!open) {
            setDeleteGroupThreadsId(null);
            setDeleteGroupThreadsList([]);
          }
        }}
        title="Delete all threads in section"
        description="Every thread in this section will be permanently removed, along with their workflow bindings. The section itself will remain empty. This action cannot be undone."
        actionLabel="Delete all threads"
        items={deleteGroupThreadsList}
        onConfirm={() => handleDeleteGroupThreads(setDeleteLoading)}
        loading={deleteLoading}
      />
      <WorkflowDialog
        open={workflowDialogOpen[0]}
        onOpenChange={(open) =>
          setWorkflowDialogOpen([open, workflowDialogOpen[1]])
        }
        defaultSection={workflowDialogOpen[1] as WorkflowSectionId}
      />
      <EntityActionDialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) {
            setRenamingThreadId(null);
            setRenamingThreadTitle("");
          }
        }}
        mode="rename-workflow"
        defaultValue={renamingThreadTitle}
        onSubmit={handleRenameThread}
        loading={renamingThreadLoading}
      />
      <EntityActionDialog
        open={sectionRenameOpen}
        onOpenChange={(open) => {
          setSectionRenameOpen(open);
          if (!open) {
            setRenamingGroupId(null);
            setRenamingGroupName("");
          }
        }}
        mode="rename-section"
        defaultValue={renamingGroupName}
        onSubmit={handleRenameGroup}
        loading={renamingGroupLoading}
      />
      <SidebarHeader>
        <SidebarWorkspaceHeader
          name={
            loading && !activeWorkspace
              ? "…"
              : (activeWorkspace?.name ?? "No workspace")
          }
          tile={
            <WorkspaceTile>
              {(activeWorkspace?.name ?? "A").charAt(0).toUpperCase()}
            </WorkspaceTile>
          }
          checkedIndex={Math.max(
            0,
            workspaces.findIndex((w) => w.id === workspaceId),
          )}
          menu={
            <>
              {workspaces.map((w, i) => (
                <MenuItem
                  key={w.id}
                  index={i}
                  label={w.name}
                  checked={w.id === workspaceId}
                  onSelect={() => router.push(`/workspace/${w.id}`)}
                />
              ))}
              <MenuItem
                index={workspaces.length}
                icon={PlusIcon}
                disabled
                label="New workspace"
                onSelect={() => {}}
              />
            </>
          }
        />
        {/* search + action rows are ONE block on the menu rows' rhythm */}
        <div className="flex flex-col gap-0.5">
          <SidebarSearchField />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton icon={BellIcon}>
                Notifications
                {/* shortcut chip, revealed on row hover */}
                <span className="ml-auto inline-flex opacity-0 transition-opacity duration-80 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100">
                  <kbd className="font-sans text-[11px] text-muted-foreground">
                    ⌘ N
                  </kbd>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>{" "}
            <SidebarMenuItem>
              <SidebarMenuButton
                icon={PlusIcon}
                onClick={() => setNewGroupOpen(true)}
              >
                New
                {/* shortcut chip, revealed on row hover */}
                <span className="ml-auto inline-flex opacity-0 transition-opacity duration-80 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100">
                  <kbd className="font-sans text-[11px] text-muted-foreground">
                    ⌘ O
                  </kbd>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.id} collapsible>
            <SidebarGroupLabel>{group.name}</SidebarGroupLabel>
            <SidebarGroupActions>
              <Tooltip content="Add item" side="top">
                <SidebarGroupAction
                  aria-label="Add item"
                  onClick={() => {
                    setPendingThreadGroupId(group.id);
                    setNewThreadOpen(true);
                  }}
                >
                  <PlusIcon />
                </SidebarGroupAction>
              </Tooltip>
              <DropdownMenu>
                <Tooltip content="Section settings" side="top">
                  <DropdownTrigger
                    render={
                      <SidebarGroupAction aria-label="Section settings">
                        <SlidersIcon />
                      </SidebarGroupAction>
                    }
                  />
                </Tooltip>
                {/* 240px — the header/footer trigger width */}
                <DropdownContent
                  className="min-w-0 w-[240px]"
                  align="start"
                  sideOffset={4}
                >
                  <MenuItem
                    index={0}
                    icon={PlayIcon}
                    label="Run all"
                    onSelect={() => {}}
                  />
                  <MenuItem
                    index={1}
                    icon={StopIcon}
                    label="Stop all"
                    onSelect={() => {}}
                  />
                  <MenuItem
                    index={2}
                    icon={PencilIcon}
                    label="Rename section"
                    onSelect={() => openRenameGroup(group.id, group.name)}
                  />

                  <DropdownSeparator />

                  <MenuItem
                    index={3}
                    icon={DeleteIcon}
                    label="Delete section"
                    onSelect={() => confirmDeleteGroup(group.id, group.name)}
                  />
                  <MenuItem
                    index={4}
                    icon={DeleteIcon}
                    label="Delete all threads"
                    onSelect={() =>
                      confirmDeleteGroupThreads(
                        group.id,
                        group.name,
                        group.threads.map((t) => ({
                          value: t.title || "Untitled",
                        })),
                      )
                    }
                  />
                </DropdownContent>
              </DropdownMenu>
            </SidebarGroupActions>
            <SidebarMenu className="gap-px">
              {group.threads.length === 0 && (
                <span className="px-2 py-1 text-[12px] text-muted-foreground">
                  {loading ? "Loading…" : "No threads yet"}
                </span>
              )}
              {group.threads.map((thread) => (
                <SidebarMenuItem key={thread.id}>
                  <SidebarMenuButton
                    isActive={thread.id === activeThread}
                    onClick={() => openThread(workspaceId, thread.id)}
                    status={
                      thread.showStatusIndicator ? thread.status : undefined
                    }
                  >
                    {thread.title}
                  </SidebarMenuButton>
                  <SidebarMenuActions showOnHover>
                    {thread.boundWorkflowId ? (
                      <Tooltip content="Run" side="top">
                        <SidebarMenuAction aria-label="Run">
                          <PlayIcon />
                        </SidebarMenuAction>
                      </Tooltip>
                    ) : (
                      <Tooltip content="Create" side="top">
                        <SidebarMenuAction aria-label="Create">
                          <PlusIcon />
                        </SidebarMenuAction>
                      </Tooltip>
                    )}
                    <Tooltip content="Rename" side="top">
                      <SidebarMenuAction
                        aria-label="Rename"
                        onClick={() =>
                          openRenameThread(thread.id, thread.title)
                        }
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
                          icon={PlayIcon}
                          label="Run"
                          onSelect={() => {}}
                        />
                        <MenuItem
                          index={1}
                          icon={PencilIcon}
                          label="Rename"
                          onSelect={() =>
                            openRenameThread(thread.id, thread.title)
                          }
                        />
                        <MenuItem
                          index={2}
                          icon={LinkIcon}
                          disabled
                          label="Share"
                          onSelect={() =>
                            setWorkflowDialogOpen([true, "share"])
                          }
                        />

                        <DropdownSeparator />
                        <MenuItem
                          index={4}
                          icon={DeleteIcon}
                          label="Delete"
                          onSelect={() =>
                            confirmDeleteThread(thread.id, thread.title)
                          }
                        />
                      </DropdownContent>
                    </DropdownMenu>
                  </SidebarMenuActions>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        {!loading && groups.length === 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Getting started</SidebarGroupLabel>

            <span className="px-2 py-1 text-[12px] text-muted-foreground">
              Create a new group to start building.
            </span>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        {callouts.length > 0 && (
          <Card
            size="compact"
            dismissible
            onDismiss={() => dismiss(1)}
            label="Aurora 2 is here — longer context, faster agents"
            className={`rounded-xl overflow-hidden min-h-0 transition-[background-color,box-shadow] duration-80 ${surfaceClasses(level, 2)} ${surfaceHoverClasses(level + 1, 3)} shadow-(--shadow-2-inset) hover:shadow-(--shadow-3-inset)`}
          >
            {/* swap for your artwork */}
            <CardImage
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Cdefs%3E%3CradialGradient id='a' cx='12%25' cy='16%25' r='70%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.9'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='b' cx='90%25' cy='12%25' r='65%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.45'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='c' cx='82%25' cy='94%25' r='75%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.8'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='d' cx='24%25' cy='90%25' r='68%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.55'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='320' height='180' fill='%23ffffff'/%3E%3Crect width='320' height='180' fill='%236B97FF' fill-opacity='0.2'/%3E%3Crect width='320' height='180' fill='url(%23a)'/%3E%3Crect width='320' height='180' fill='url(%23b)'/%3E%3Crect width='320' height='180' fill='url(%23c)'/%3E%3Crect width='320' height='180' fill='url(%23d)'/%3E%3C/svg%3E"
              className="aspect-[2/1] max-h-28"
            />
            <CardHeader className="gap-0 pt-3">
              <CardTitle className="truncate">Aurora 2 is here</CardTitle>
              <CardDescription className="truncate">
                Longer context, faster agents
              </CardDescription>
            </CardHeader>
          </Card>
        )}
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
            <SidebarMenuButton
              icon={isDark ? SunIcon : MoonIcon}
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              Toggle Theme
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarUserFooter
          name={user?.name || user?.email || "Account"}
          avatar={
            user?.pfp ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.pfp}
                alt=""
                className="size-5 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-5 items-center justify-center rounded-full bg-muted-foreground text-[10px] text-background">
                {(user?.name || user?.email || "A").charAt(0).toUpperCase()}
              </span>
            )
          }
          menu={
            <>
              <MenuItem
                index={0}
                icon={UserIcon}
                label="Profile"
                onSelect={() => {}}
              />

              <MenuItem
                index={2}
                icon={ArrowLeftIcon}
                label="Log out"
                onSelect={() => {}}
              />
            </>
          }
        />
      </SidebarFooter>
    </Sidebar>
  );
}
