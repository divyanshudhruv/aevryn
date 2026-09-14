"use client";

import { useMemo, useState } from "react";
import {
  CommandMenu,
  CommandMenuDialog,
  CommandMenuInput,
  CommandMenuTabs,
  CommandMenuFilters,
  CommandMenuList,
  CommandMenuEmpty,
  CommandMenuFooter,
  CommandMenuShortcut,
  type CommandMenuItemData,
} from "@aevryn/ui/components/command-menu";
import { Button } from "@aevryn/ui/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@aevryn/ui/components/ui/select";
import { useIcons, type IconName } from "@aevryn/ui/lib/icon-context";

// Seed actions for the generated menu, replace with your own. Icons are
// slot names, resolved through the icon context at render.
const ITEMS: readonly {
  value: string;
  label: string;
  /** Names Enter in the footer while highlighted; defaults to the label. */
  action?: string;
  description?: string;
  icon: IconName;
  shortcut?: string;
  keywords?: readonly string[];
  group: string;
  disabled?: boolean;
}[] = [
  {
    value: "new-file",
    label: "New file",
    description: "Blank document",
    icon: "plus",
    shortcut: "mod+n",
    keywords: ["create", "document"],
    group: "Actions",
  },
  {
    value: "search",
    label: "Search everywhere",
    description: "Files, people, messages",
    icon: "search",
    shortcut: "mod+shift+f",
    keywords: ["find"],
    group: "Actions",
  },
  {
    value: "theme",
    label: "Toggle dark mode",
    description: "System, light, or dark",
    icon: "moon",
    shortcut: "mod+shift+l",
    keywords: ["appearance", "theme"],
    group: "Actions",
  },
  {
    value: "copy-link",
    label: "Copy link",
    description: "To this page",
    icon: "link",
    shortcut: "mod+shift+c",
    keywords: ["share", "url"],
    group: "Actions",
  },
  {
    value: "invite",
    label: "Invite people",
    description: "Send an email invite",
    icon: "users",
    keywords: ["team", "member"],
    group: "Actions",
  },
  {
    value: "export",
    label: "Export as PDF",
    description: "Pro plan",
    icon: "image",
    keywords: ["download"],
    group: "Actions",
    disabled: true,
  },
  {
    value: "home",
    label: "Home",
    action: "Go to Home",
    icon: "home",
    group: "Go to",
  },
  {
    value: "inbox",
    label: "Inbox",
    action: "Go to Inbox",
    description: "3 unread",
    icon: "inbox",
    keywords: ["mail", "notifications"],
    group: "Go to",
  },
  {
    value: "calendar",
    label: "Calendar",
    action: "Go to Calendar",
    description: "Today",
    icon: "calendar",
    keywords: ["events", "schedule"],
    group: "Go to",
  },
  {
    value: "starred",
    label: "Starred",
    action: "Go to Starred",
    icon: "star",
    keywords: ["favorites"],
    group: "Go to",
  },
  {
    value: "recent",
    label: "Recent",
    action: "Go to Recent",
    description: "Last 7 days",
    icon: "clock",
    keywords: ["history"],
    group: "Go to",
  },
  {
    value: "settings",
    label: "Settings",
    action: "Go to Settings",
    description: "Account and workspace",
    icon: "settings",
    shortcut: "mod+,",
    keywords: ["preferences"],
    group: "Go to",
  },
  {
    value: "docs",
    label: "Documentation",
    icon: "square-library",
    keywords: ["help", "guide"],
    group: "Help",
  },
  {
    value: "whats-new",
    label: "What's new",
    description: "Release notes",
    icon: "rocket",
    keywords: ["changelog", "updates"],
    group: "Help",
  },
  {
    value: "support",
    label: "Contact support",
    description: "Reply within a day",
    icon: "message-circle",
    keywords: ["help", "chat"],
    group: "Help",
  },
];

// Listed first while nothing is typed.
const SUGGESTIONS = ["calendar", "new-file", "settings"];

const TABS = [
  { value: "all", label: "All" },
  { value: "Actions", label: "Actions" },
  { value: "Go to", label: "Go to" },
  { value: "Help", label: "Help" },
];

const TYPES = [
  { value: "all", label: "All types" },
  { value: "Actions", label: "Actions" },
  { value: "Go to", label: "Go to" },
  { value: "Help", label: "Help" },
];
const SORTS = [
  { value: "default", label: "Default order" },
  { value: "az", label: "A to Z" },
];

export function CommandMenuDemo() {
  const icons = useIcons();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("default");
  // Memoized: the highlight resets to the first row when the rows change.
  const items = useMemo<CommandMenuItemData[]>(() => {
    const all = ITEMS.map(({ icon, ...item }) => ({
      ...item,
      icon: icons[icon],
    }));
    // The header controls are state; the rows derive from them.
    let visible = all;
    if (tab !== "all") visible = visible.filter((item) => item.group === tab);
    if (type !== "all") visible = visible.filter((item) => item.group === type);
    if (sort === "az")
      visible = [...visible].sort((a, b) => a.label.localeCompare(b.label));
    return visible;
  }, [icons, tab, type, sort]);

  const run = (item: CommandMenuItemData) => {
    // Your action here.
    console.log("ran", item.value);
  };

  const filters = (
    <CommandMenuFilters>
      <Select value={type} onValueChange={setType}>
        <SelectTrigger variant="borderless" aria-label="Type" />
        <SelectContent>
          {TYPES.map((option, i) => (
            <SelectItem key={option.value} value={option.value} index={i}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={setSort}>
        <SelectTrigger variant="borderless" aria-label="Sort" />
        <SelectContent>
          {SORTS.map((option, i) => (
            <SelectItem key={option.value} value={option.value} index={i}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </CommandMenuFilters>
  );

  return (
    <>
      <CommandMenuShortcut keys="mod+k" className="ml-1" />
      {/* shortcut: mod is ⌘ on a Mac, Ctrl elsewhere. A pick closes the dialog. */}
      <CommandMenuDialog open={open} onOpenChange={setOpen} shortcut="mod+k">
        <CommandMenu items={items} suggestions={SUGGESTIONS} onSelect={run}>
          <CommandMenuInput placeholder="Type a command or search…" />
          {/* Filters inside the tabs share the row, hugging their controls. */}
          <CommandMenuTabs tabs={TABS} value={tab} onValueChange={setTab}>
            {filters}
          </CommandMenuTabs>
          <CommandMenuList>
            <CommandMenuEmpty>No results.</CommandMenuEmpty>
          </CommandMenuList>
          <CommandMenuFooter />
        </CommandMenu>
      </CommandMenuDialog>
    </>
  );
}
