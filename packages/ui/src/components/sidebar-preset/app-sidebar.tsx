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
import { DropdownMenu, DropdownTrigger, DropdownContent } from "@aevryn/ui/components/ui/dropdown";
import { MenuItem } from "@aevryn/ui/components/ui/menu-item";
import { useIcon, useIcons } from "@aevryn/ui/lib/icon-context";
import { SidebarWorkspaceHeader, WorkspaceTile } from "@aevryn/ui/components/sidebar-app/workspace-header";
import { SidebarUserFooter } from "@aevryn/ui/components/sidebar-app/user-footer";
import { SidebarSearchField } from "@aevryn/ui/components/sidebar-app/search-field";
import { Card, CardImage, CardHeader, CardTitle, CardDescription } from "@aevryn/ui/components/card";
import { surfaceClasses, surfaceHoverClasses } from "@aevryn/ui/lib/surface-classes";
import { useSurface } from "@aevryn/ui/lib/surface-context";
import { AnimatePresence, motion as m } from "framer-motion";
import { spring } from "@aevryn/ui/lib/springs";
import { NAV_SECTIONS } from "@aevryn/ui/components/sidebar-preset/nav-data";

const CALLOUTS = [
  { id: 1, title: "Aurora 2 is here", desc: "Longer context, faster agents" },
  { id: 2, title: "New workspace roles", desc: "Owner, editor, viewer" },
  { id: 3, title: "Dark mode shipped", desc: "Follows your system" },
];

export function AppSidebar(props: Omit<SidebarProps, "children">) {
  const [active, setActive] = useState("New pricing page exploration");
  const [callouts, setCallouts] = useState(CALLOUTS);
  const dismiss = (id: number) => setCallouts((c) => c.filter((x) => x.id !== id));
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
  const CommandMenuIcon = useIcon("command");
  const BellIcon = useIcon("bell")

  return (
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
          <SidebarSearchField />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton icon={PlusIcon}>
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
                Notifications
                {/* shortcut chip, revealed on row hover */}
                <span
                  className="ml-auto inline-flex opacity-0 transition-opacity duration-80
                  group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                >
                  <kbd className="font-sans text-[11px] text-muted-foreground">
                    ⌘N
                  </kbd>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton icon={CommandMenuIcon}>
                Command
                {/* shortcut chip, revealed on row hover */}
                <span
                  className="ml-auto inline-flex opacity-0 transition-opacity duration-80
                  group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                >
                  <kbd className="font-sans text-[11px] text-muted-foreground">
                    ⌘K
                  </kbd>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_SECTIONS.map((section) => (
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
            <SidebarMenu>
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
                    <Tooltip content="Add" side="top">
                      <SidebarMenuAction aria-label="Add">
                        <PlusIcon />
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
                          icon={PencilIcon}
                          label="Rename"
                          onSelect={() => {}}
                        />
                        <MenuItem
                          index={1}
                          icon={LinkIcon}
                          label="Share"
                          onSelect={() => {}}
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
          animate={{ height: collapsedH }}
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
                  shadow-[var(--shadow-2-inset)] hover:shadow-[var(--shadow-3-inset)]`}
                >
                  {/* swap for your artwork */}
                  <CardImage
                    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Cdefs%3E%3CradialGradient id='a' cx='12%25' cy='16%25' r='70%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.9'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='b' cx='90%25' cy='12%25' r='65%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.45'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='c' cx='82%25' cy='94%25' r='75%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.8'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='d' cx='24%25' cy='90%25' r='68%25'%3E%3Cstop offset='0%25' stop-color='%236B97FF' stop-opacity='0.55'/%3E%3Cstop offset='100%25' stop-color='%236B97FF' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='320' height='180' fill='%23ffffff'/%3E%3Crect width='320' height='180' fill='%236B97FF' fill-opacity='0.2'/%3E%3Crect width='320' height='180' fill='url(%23a)'/%3E%3Crect width='320' height='180' fill='url(%23b)'/%3E%3Crect width='320' height='180' fill='url(%23c)'/%3E%3Crect width='320' height='180' fill='url(%23d)'/%3E%3C/svg%3E"
                    className="aspect-[2/1] max-h-28"
                  />
                  <CardHeader className="gap-0 pt-3">
                    <CardTitle className="truncate">{c.title}</CardTitle>
                    <CardDescription className="truncate text-caption">
                      {c.desc}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </m.div>
            ))}
          </AnimatePresence>
        </m.div>
        <div className="flex items-center gap-1 pr-1.5">
          <SidebarUserFooter
            name="Jane Doe"
            avatar={
              <span className="flex size-5 items-center justify-center rounded-full bg-muted-foreground text-[10px] text-background">
                J
              </span>
            }
            className="min-w-0 flex-1"
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
                  onSelect={() => {}}
                />
              </>
            }
          />
          <Tooltip content="Settings" side="top">
            <button
              type="button"
              aria-label="Settings"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground
                outline-none hover:bg-hover hover:text-foreground transition-colors duration-80
                focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]"
            >
              <FooterSettingsIcon size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
          <Tooltip content="Theme" side="top">
            <button
              type="button"
              aria-label="Theme"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground
                outline-none hover:bg-hover hover:text-foreground transition-colors duration-80
                focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]"
            >
              <MoonIcon size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
