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
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@aevryn/ui/components/ui/select";
import { useIcons, type IconName } from "@aevryn/ui/lib/icon-context";

// Seed actions for the generated menu, replace with your own. Icons are
// slot names, resolved through the icon context at render.
// const ITEMS: readonly {
//   value: string;
//   label: string;
//   /** Names Enter in the footer while highlighted; defaults to the label. */
//   action?: string;
//   description?: string;
//   icon: IconName;
//   shortcut?: string;
//   keywords?: readonly string[];
//   group: string;
//   disabled?: boolean;
// }[] = [
//   {
//     value: "new-file",
//     label: "New file",
//     description: "Blank document",
//     icon: "plus",
//     shortcut: "mod+n",
//     keywords: ["create", "document"],
//     group: "Actions",
//   },
//   {
//     value: "search",
//     label: "Search everywhere",
//     description: "Files, people, messages",
//     icon: "search",
//     shortcut: "mod+shift+f",
//     keywords: ["find"],
//     group: "Actions",
//   },
//   {
//     value: "theme",
//     label: "Toggle dark mode",
//     description: "System, light, or dark",
//     icon: "moon",
//     shortcut: "mod+shift+l",
//     keywords: ["appearance", "theme"],
//     group: "Actions",
//   },
//   {
//     value: "copy-link",
//     label: "Copy link",
//     description: "To this page",
//     icon: "link",
//     shortcut: "mod+shift+c",
//     keywords: ["share", "url"],
//     group: "Actions",
//   },
//   {
//     value: "invite",
//     label: "Invite people",
//     description: "Send an email invite",
//     icon: "users",
//     keywords: ["team", "member"],
//     group: "Actions",
//   },
//   {
//     value: "export",
//     label: "Export as PDF",
//     description: "Pro plan",
//     icon: "image",
//     keywords: ["download"],
//     group: "Actions",
//     disabled: true,
//   },
//   {
//     value: "home",
//     label: "Home",
//     action: "Go to Home",
//     icon: "home",
//     group: "Go to",
//   },
//   {
//     value: "inbox",
//     label: "Inbox",
//     action: "Go to Inbox",
//     description: "3 unread",
//     icon: "inbox",
//     keywords: ["mail", "notifications"],
//     group: "Go to",
//   },
//   {
//     value: "calendar",
//     label: "Calendar",
//     action: "Go to Calendar",
//     description: "Today",
//     icon: "calendar",
//     keywords: ["events", "schedule"],
//     group: "Go to",
//   },
//   {
//     value: "starred",
//     label: "Starred",
//     action: "Go to Starred",
//     icon: "star",
//     keywords: ["favorites"],
//     group: "Go to",
//   },
//   {
//     value: "recent",
//     label: "Recent",
//     action: "Go to Recent",
//     description: "Last 7 days",
//     icon: "clock",
//     keywords: ["history"],
//     group: "Go to",
//   },
//   {
//     value: "settings",
//     label: "Settings",
//     action: "Go to Settings",
//     description: "Account and workspace",
//     icon: "settings",
//     shortcut: "mod+,",
//     keywords: ["preferences"],
//     group: "Go to",
//   },
//   {
//     value: "docs",
//     label: "Documentation",
//     icon: "square-library",
//     keywords: ["help", "guide"],
//     group: "Help",
//   },
//   {
//     value: "whats-new",
//     label: "What's new",
//     description: "Release notes",
//     icon: "rocket",
//     keywords: ["changelog", "updates"],
//     group: "Help",
//   },
//   {
//     value: "support",
//     label: "Contact support",
//     description: "Reply within a day",
//     icon: "message-circle",
//     keywords: ["help", "chat"],
//     group: "Help",
//   },
// ];

// Aevryn-native commands — every item maps to a real feature (threads,
// groups, workflows, runs, models, settings). Items whose wiring isn't
// built yet ship disabled so the palette stays honest.
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
  // ── Actions ────────────────────────────────────────────────
  {
    value: "new-thread",
    label: "New thread",
    description: "In the current group",
    icon: "plus",
    shortcut: "mod+o",
    keywords: ["create", "chat", "conversation"],
    group: "Actions",
  },
  {
    value: "new-group",
    label: "New group",
    description: "Organize threads into a section",
    icon: "sliders-horizontal",
    keywords: ["create", "section", "folder"],
    group: "Actions",
  },
  {
    value: "rename-thread",
    label: "Rename this thread",
    icon: "pencil",
    keywords: ["edit", "title"],
    group: "Actions",
  },
  {
    value: "delete-thread",
    label: "Delete this thread",
    description: "Move to confirm dialog",
    icon: "dustbin",
    keywords: ["remove", "trash"],
    group: "Actions",
  },
  {
    value: "bind-workflow",
    label: "Bind a workflow…",
    description: "Plan → steps → automated runs",
    icon: "link",
    keywords: ["attach", "plan", "automate"],
    group: "Actions",
  },
  {
    value: "copy-thread-link",
    label: "Copy thread link",
    description: "Share this conversation's URL",
    icon: "link",
    shortcut: "mod+shift+c",
    keywords: ["share", "url", "copy"],
    group: "Actions",
  },
  {
    value: "toggle-theme",
    label: "Toggle theme",
    description: "Light ↔ dark",
    icon: "moon",
    shortcut: "mod+shift+l",
    keywords: ["appearance", "dark", "light"],
    group: "Actions",
  },
  {
    value: "open-settings",
    label: "Open settings",
    description: "Models, keys, notifications, appearance",
    icon: "settings",
    shortcut: "mod+,",
    keywords: ["preferences", "providers", "api"],
    group: "Actions",
  },
  {
    value: "new-workspace",
    label: "New workspace",
    description: "Not available yet",
    icon: "user",
    keywords: ["create", "team", "space"],
    group: "Actions",
    disabled: true,
  },

  // ── Run ───────────────────────────────────────────────────
  {
    value: "run-thread",
    label: "Run this thread",
    description: "Execute its bound workflow",
    icon: "play",
    shortcut: "mod+enter",
    keywords: ["start", "execute", "workflow"],
    group: "Run",
  },
  {
    value: "stop-thread",
    label: "Stop this thread",
    description: "Cancel the running workflow",
    icon: "stop",
    keywords: ["cancel", "abort", "halt"],
    group: "Run",
  },
  {
    value: "run-all",
    label: "Run all in group",
    description: "Every runnable bound thread",
    icon: "play",
    keywords: ["batch", "execute", "all"],
    group: "Run",
  },
  {
    value: "stop-all",
    label: "Stop all in group",
    description: "Cancel every active run",
    icon: "stop",
    keywords: ["batch", "cancel", "all"],
    group: "Run",
  },
  {
    value: "switch-model",
    label: "Switch model…",
    description: "Pick from your providers",
    icon: "sliders-horizontal",
    keywords: ["provider", "groq", "llm", "change"],
    group: "Run",
  },
  {
    value: "thinking-budget",
    label: "Set thinking budget…",
    description: "Free · Low · Medium · High · Ultra · God",
    icon: "command",
    keywords: ["quality", "reasoning", "tokens", "effort"],
    group: "Run",
  },

  // ── Go to ─────────────────────────────────────────────────
  {
    value: "go-thread",
    label: "Go to thread…",
    description: "Type to search thread titles",
    icon: "search",
    keywords: ["find", "open", "conversation"],
    group: "Go to",
  },
  {
    value: "go-workspace",
    label: "Go to workspace…",
    description: "Switch the active workspace",
    icon: "user",
    keywords: ["switch", "space", "team"],
    group: "Go to",
  },
  {
    value: "go-notification",
    label: "Notifications",
    action: "Go to Notifications",
    description: "Threads needing attention",
    icon: "bell",
    keywords: ["failed", "approval", "attention", "retrying"],
    group: "Go to",
  },

  // ── Help ──────────────────────────────────────────────────
  {
    value: "shortcuts",
    label: "Keyboard shortcuts",
    description: "Every shortcut in one sheet",
    icon: "command",
    shortcut: "mod+k",
    keywords: ["keys", "hotkeys"],
    group: "Help",
  },
  {
    value: "logout",
    label: "Log out",
    icon: "arrow-left",
    keywords: ["sign out", "session", "exit"],
    group: "Help",
  },
];

// Listed first while nothing is typed.
// const SUGGESTIONS = ["calendar", "new-file", "settings"];

// const TABS = [
//   { value: "all", label: "All" },
//   { value: "Actions", label: "Actions" },
//   { value: "Go to", label: "Go to" },
//   { value: "Help", label: "Help" },
// ];

// const TYPES = [
//   { value: "all", label: "All types" },
//   { value: "Actions", label: "Actions" },
//   { value: "Go to", label: "Go to" },
//   { value: "Help", label: "Help" },
// ];

const SUGGESTIONS = ["new-thread", "run-thread", "go-thread", "open-settings"];

const TABS = [
  { value: "all", label: "All" },
  { value: "Actions", label: "Actions" },
  { value: "Run", label: "Run" },
  { value: "Go to", label: "Go to" },
  { value: "Help", label: "Help" },
];

const TYPES = [
  { value: "all", label: "All types" },
  { value: "Actions", label: "Actions" },
  { value: "Run", label: "Run" },
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
