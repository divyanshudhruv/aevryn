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
  SidebarMenuBadge,
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
import { useIcon, useIcons } from "@aevryn/ui/lib/icon-context";
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
import { NAV_SECTIONS } from "@aevryn/ui/components/sidebar-preset/nav-data";
import { CommandMenuDemo } from "../command-menu-demo";
import { DotmCircular2 } from "../dotm-circular-2";
import type { RunStatus } from "@aevryn/db";
import { SettingsDialog } from "../dialog/settings-dialog";
import { NewGroupDialog } from "../dialog/new-group-dialog";
import { NewThreadDialog } from "../dialog/new-thread-dialog";
import { ConfirmDeleteDialog } from "../dialog/confirm-delete-dialog";
import { RenameThreadDialog } from "../dialog/rename-thread-dialog";
import { RenameGroupDialog } from "../dialog/rename-group-dialog";
import { Badge } from "../ui/badge";
const CALLOUTS = [
  { id: 1, title: "Aurora 2 is here", desc: "Longer context, faster agents" },
  { id: 2, title: "New workspace roles", desc: "Owner, editor, viewer" },
  { id: 3, title: "Dark mode shipped", desc: "Follows your system" },
];

export function AppSidebar(props: Omit<SidebarProps, "children">) {
  const [active, setActive] = useState("New pricing page exploration");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [callouts, setCallouts] = useState(CALLOUTS);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 0);
    return () => clearTimeout(timer);
  }, [search]);
  const dismiss = (id: number) =>
    setCallouts((c) => c.filter((x) => x.id !== id));
  // The callout rests one surface step above the rail.
  const level = Math.min(useSurface() + 1, 8);
  const [expanded, setExpanded] = useState(false);
  // Front card's measured height — never an animated "auto".
  const [cardH, setCardH] = useState(64);
  const collapsedH = cardH + Math.min(callouts.length - 1, 2) * 12;
  const expandedH = callouts.length * cardH + (callouts.length - 1) * 4;
  const PlusIcon = useIcon("plus");
  const PencilIcon = useIcon("pencil");
  const MoreVerticalIcon = useIcon("more-vertical");
  const LinkIcon = useIcon("link");
  const SlidersIcon = useIcon("sliders-horizontal");
  const UsersIcon = useIcon("users");
  const UserIcon = useIcon("user");
  const SettingsIcon = useIcon("settings");
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
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [renameThreadOpen, setRenameThreadOpen] = useState(false);
  const [renameGroupOpen, setRenameGroupOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  const { resolvedTheme, setTheme } = useTheme();

  const themeCycle: Array<"light" | "dark"> = ["light", "dark"];

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  const handleThemeToggle = useCallback(() => {
    setTheme(nextTheme);
  }, [nextTheme, setTheme]);

  const filteredItems = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    if (query === "") return null;
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.label.toLowerCase().includes(query),
      ),
    }));
  }, [debouncedSearch]);

  const threadCount = useMemo(() => {
    if (filteredItems === null) return 0;
    let count = 0;
    for (const section of filteredItems) count += section.items.length;
    return count;
  }, [filteredItems]);

  return (
    <>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} />
      <NewThreadDialog open={newThreadOpen} onOpenChange={setNewThreadOpen} />
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
      />
      <RenameThreadDialog
        open={renameThreadOpen}
        onOpenChange={setRenameThreadOpen}
      />
      <RenameGroupDialog
        open={renameGroupOpen}
        onOpenChange={setRenameGroupOpen}
      />
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <SidebarWorkspaceHeader
            name="Acme Inc"
            tile={<WorkspaceTile>A</WorkspaceTile>}
            checkedIndex={0}
            menu={
              <>
                <MenuItem
                  index={0}
                  label="Acme Inc"
                  checked
                  onSelect={() => {}}
                />
                <MenuItem index={1} label="Personal" onSelect={() => {}} />
                <MenuItem
                  index={2}
                  icon={PlusIcon}
                  label="New workspace"
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
                  <span
                    className="ml-auto inline-flex opacity-0 transition-opacity duration-80
                  group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                  >
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
          {" "}
          {NAV_SECTIONS === null && (
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
          {(filteredItems ?? NAV_SECTIONS).map((section) => (
            <SidebarGroup key={section.label} collapsible>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupActions>
                <Tooltip content="Add item" side="top">
                  <SidebarGroupAction
                    aria-label="Add thread"
                    onClick={() => setNewThreadOpen(true)}
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
                        onSelect={() => {}}
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
                        onSelect={() => {}}
                      />
                      <MenuItem
                        index={2}
                        icon={PencilIcon}
                        label="Rename Group"
                        onSelect={() => setRenameThreadOpen(true)}
                      />

                      <DropdownSeparator />
                      <MenuItem
                        index={3}
                        icon={DustbinIcon}
                        label="Delete Group"
                        onSelect={() => setConfirmDeleteOpen(true)}
                      />
                    </DropdownContent>
                  </DropdownMenu>
                </Tooltip>
              </SidebarGroupActions>
              <SidebarMenu>
                {section.items
                  .filter(
                    (item) =>
                      debouncedSearch === "" ||
                      item.label
                        .toLowerCase()
                        .includes(debouncedSearch.toLowerCase()),
                  )
                  .map((item) => (
                    <SidebarMenuItem key={item.id ?? item.label}>
                      {/* status drives the dot and the screen-reader "unread" text */}
                      <SidebarMenuButton
                        status={item.status as RunStatus}
                        isActive={item.label === active}
                        onClick={() => setActive(item.label)}
                      >
                        {item.label}
                      </SidebarMenuButton>
                      {item.badge && (
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      )}
                      <SidebarMenuActions showOnHover>
                        <Tooltip
                          content={item.status === "running" ? "Stop" : "Run"}
                          side="top"
                        >
                          {item.status != "awaiting_approval" && (
                            <Tooltip
                              content={
                                item.status === "running" ? "Stop" : "Run"
                              }
                              side="top"
                            >
                              <SidebarMenuAction aria-label="Run/Stop">
                                {item.status === "running" ? (
                                  <StopIcon />
                                ) : (
                                  <PlayIcon />
                                )}
                              </SidebarMenuAction>
                            </Tooltip>
                          )}
                        </Tooltip>
                        <Tooltip content="Rename" side="top">
                          <SidebarMenuAction
                            aria-label="Rename"
                            onClick={() => setRenameThreadOpen(true)}
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
                              onSelect={() => {}}
                              disabled={item.status === "awaiting_approval"}
                            />

                            <MenuItem
                              index={2}
                              icon={PencilIcon}
                              label="Rename"
                              onSelect={() => setRenameThreadOpen(true)}
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
                              onSelect={() => setConfirmDeleteOpen(true)}
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
                    label="Aurora 2 is here — longer context, faster agents"
                    className={`rounded-xl overflow-hidden min-h-0 transition-[background-color,box-shadow]
                  duration-80 ${surfaceClasses(level, 2)} ${surfaceHoverClasses(level + 1, 3)}
                  shadow-(--shadow-2-inset) hover:shadow-(--shadow-3-inset)`}
                  >
                    {/* swap for your artwork */}
                    <CardImage
                      src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Cdefs%3E%3CradialGradient id='a' cx='12%25' cy='16%25' r='70%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.9'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='b' cx='90%25' cy='12%25' r='65%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.45'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='c' cx='82%25' cy='94%25' r='75%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.8'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='d' cx='24%25' cy='90%25' r='68%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.55'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='320' height='180' fill='%23ffffff'/%3E%3Crect width='320' height='180' fill='%236B97FF' fill-opacity='0.2'/%3E%3Crect width='320' height='180' fill='url(%23a)'/%3E%3Crect width='320' height='180' fill='url(%23b)'/%3E%3Crect width='320' height='180' fill='url(%23c)'/%3E%3Crect width='320' height='180' fill='url(%23d)'/%3E%3C/svg%3E"
                      className="aspect-[2/1] max-h-28"
                    />
                    <CardHeader className="gap-0 pt-3">
                      <CardTitle className="truncate">{c.title}</CardTitle>
                      <CardDescription className="truncate text-caption text-muted-foreground">
                        {c.desc}
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
            name="Jane Doe"
            avatar={
              <span className="flex size-5 items-center justify-center rounded-full bg-muted-foreground text-[10px] text-background">
                J
              </span>
            }
            menu={
              <>
                <MenuItem index={0} icon={UserIcon} label="Profile" disabled />

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
    </>
  );
}
