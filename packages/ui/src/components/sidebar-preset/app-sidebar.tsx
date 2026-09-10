"use client";

import { useState } from "react";
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
} from "@aevryn/ui/components/ui/sidebar";
import { Tooltip } from "@aevryn/ui/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSeparator
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
import { NAV_SECTIONS, type NavItemStatus } from "@aevryn/ui/components/sidebar-preset/nav-data";
import { SettingsDialog } from "../dialog/settings-dialog";
import { PlayIcon } from "lucide-react";

const CALLOUTS = [
  { id: 1, title: "Aurora 2 is here", desc: "Longer context, faster agents" },
];

export interface SidebarThreadItem {
  id: string;
  label: string;
  status: NavItemStatus;
  badge?: string;
  /** Number of messages sent on this thread — rendered as the row badge
   *  when present (message count wins over a generic `badge`). */
  messageCount?: number;
}

export interface AppSidebarProps extends Omit<SidebarProps, "children"> {
  /** Real thread list. When provided, the WORKFLOWS demo sections are
   *  replaced by a single THREADS group driven by this data. */
  threads?: SidebarThreadItem[];
  activeThreadId?: string | null;
  onNavigate?: (id: string) => void;
  onNewThread?: () => void;
  onRunThread?: (id: string) => void;
  onRenameThread?: (id: string) => void;
  onDeleteThread?: (id: string) => void;
  onSignOut?: () => void;
}

export function AppSidebar(props: AppSidebarProps) {
  const {
    threads,
    activeThreadId,
    onNavigate,
    onNewThread,
    onRunThread,
    onRenameThread,
    onDeleteThread,
    onSignOut,
    ...sidebarProps
  } = props;
  const [active, setActive] = useState("New pricing page exploration");
  const [callouts, setCallouts] = useState(CALLOUTS);
  const dismiss = (id: number) =>
    setCallouts((c) => c.filter((x) => x.id !== id));
  // The callout rests one surface step above the rail.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const level = Math.min(useSurface() + 1, 8);
  const PlusIcon = useIcon("plus");
  const PencilIcon = useIcon("pencil");
  const MoreVerticalIcon = useIcon("more-vertical");
  const LinkIcon = useIcon("link");
  const SlidersIcon = useIcon("sliders-horizontal");
  const UserIcon = useIcon("user");
  const SettingsIcon = useIcon("settings");
  const ArrowLeftIcon = useIcon("arrow-left");
  const FooterSettingsIcon = useIcon("settings");
  const MoonIcon = useIcon("moon");
  const BellIcon = useIcon("bell");
  const DeleteIcon = useIcon("dustbin");

  return (
    <Sidebar variant="inset" {...sidebarProps}>
      {" "}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
          <SidebarSearchField />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton icon={BellIcon}>
                Notifications
                {/* shortcut chip, revealed on row hover */}
                <span
                  className="ml-auto inline-flex opacity-0 transition-opacity duration-80
                  group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                >
                  <kbd className="font-sans text-[11px] text-muted-foreground">
                    ⌘ N
                  </kbd>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>{" "}
            <SidebarMenuItem>
              <SidebarMenuButton
                icon={PlusIcon}
                onClick={() => onNewThread?.()}
              >
                New
                {/* shortcut chip, revealed on row hover */}
                <span
                  className="ml-auto inline-flex opacity-0 transition-opacity duration-80
                  group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                >
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
        {threads ? (
          <SidebarGroup collapsible>
            <SidebarGroupLabel>THREADS</SidebarGroupLabel>
            <SidebarGroupActions>
              <Tooltip content="Add item" side="top">
                <SidebarGroupAction
                  aria-label="Add item"
                  onClick={() => onNewThread?.()}
                >
                  <PlusIcon />
                </SidebarGroupAction>
              </Tooltip>
            </SidebarGroupActions>
            <SidebarMenu className="gap-px">
              {threads.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    status={item.status}
                    isActive={item.id === activeThreadId}
                    onClick={() => onNavigate?.(item.id)}
                  >
                    {item.label}
                  </SidebarMenuButton>
                  {(item.messageCount ?? 0) > 0 && (
                    <SidebarMenuBadge>{item.messageCount}</SidebarMenuBadge>
                  )}
                  {item.badge && (item.messageCount ?? 0) === 0 && (
                    <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                  )}
                  <SidebarMenuActions showOnHover>
                    {onRunThread && (
                      <Tooltip content="Run" side="top">
                        <SidebarMenuAction
                          aria-label="Run"
                          onClick={() => onRunThread(item.id)}
                        >
                          <PlayIcon />
                        </SidebarMenuAction>
                      </Tooltip>
                    )}
                    {onRenameThread && (
                      <Tooltip content="Rename" side="top">
                        <SidebarMenuAction
                          aria-label="Rename"
                          onClick={() => onRenameThread(item.id)}
                        >
                          <PencilIcon />
                        </SidebarMenuAction>
                      </Tooltip>
                    )}
                    <DropdownMenu>
                      <DropdownTrigger
                        render={
                          <SidebarMenuAction aria-label="More options">
                            <MoreVerticalIcon />
                          </SidebarMenuAction>
                        }
                      />
                      <DropdownContent
                        className="min-w-0 w-[240px]"
                        align="start"
                        sideOffset={4}
                      >
                        {onRenameThread && (
                          <MenuItem
                            index={0}
                            icon={PencilIcon}
                            label="Rename"
                            onSelect={() => onRenameThread(item.id)}
                          />
                        )}
                        <MenuItem
                          index={1}
                          icon={LinkIcon}
                          label="Share"
                          onSelect={() => {}}
                        />
                        {onDeleteThread && (
                          <MenuItem
                            index={2}
                            icon={DeleteIcon}
                            label="Delete"
                            onSelect={() => onDeleteThread(item.id)}
                          />
                        )}
                      </DropdownContent>
                    </DropdownMenu>
                  </SidebarMenuActions>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          NAV_SECTIONS.map((section) => (
            <SidebarGroup key={section.label} collapsible>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupActions>
                <Tooltip content="Add item" side="top">
                  <SidebarGroupAction aria-label="Add item">
                    <PlusIcon />
                  </SidebarGroupAction>
                </Tooltip>
                <Tooltip content="Section settings" side="top">
                  <SidebarGroupAction aria-label="Section settings">
                    <SlidersIcon />
                  </SidebarGroupAction>
                </Tooltip>
              </SidebarGroupActions>
              <SidebarMenu className="gap-px">
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    {/* status drives the dot and the screen-reader "unread" text */}
                    <SidebarMenuButton
                      status={item.status}
                      isActive={item.label === active}
                      onClick={() => setActive(item.label)}
                    >
                      {item.label}
                    </SidebarMenuButton>
                    {item.badge && (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    )}
                    <SidebarMenuActions showOnHover>
                      <Tooltip content="Run" side="top">
                        <SidebarMenuAction aria-label="Run">
                          <PlayIcon />
                        </SidebarMenuAction>
                      </Tooltip>
                      <Tooltip content="Rename" side="top">
                        <SidebarMenuAction aria-label="Rename">
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
                            onSelect={() => {}}
                          />
                          <MenuItem
                            index={2}
                            icon={LinkIcon}
                            label="Share"
                            onSelect={() => {}}
                          />
                          <DropdownSeparator/>
                          {/* a confirmation dialog to delete this thread permanently, includign cascade everything from database */}
                          <MenuItem
                            index={3}
                            icon={DeleteIcon}
                            label="Delete"
                            onSelect={() => {}}
                          />
                        </DropdownContent>
                      </DropdownMenu>
                    </SidebarMenuActions>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>
      <SidebarFooter>
        {callouts.length > 0 && (
          <Card
            size="compact"
            dismissible
            onDismiss={() => dismiss(1)}
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
              Settings
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton icon={MoonIcon}>Theme</SidebarMenuButton>
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
              <MenuItem
                index={0}
                icon={UserIcon}
                label="Profile"
                onSelect={() => {}}
              />
              <MenuItem
                index={1}
                icon={SettingsIcon}
                label="Settings"
                onSelect={() => {}}
              />
              <MenuItem
                index={2}
                icon={ArrowLeftIcon}
                label="Log out"
                onSelect={() => onSignOut?.()}
              />
            </>
          }
        />
      </SidebarFooter>
    </Sidebar>
  );
}
