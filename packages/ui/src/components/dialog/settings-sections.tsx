"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { InputGroup, InputField } from "../ui/input-group";
import { Select, SelectTrigger, SelectContent, SelectItem } from "../ui/select";
import { Switch } from "../ui/switch";
import { useIcons } from "@aevryn/ui/lib/icon-context";
import { useSizeContext } from "@aevryn/ui/lib/size-context";
import { useTheme } from "next-themes";
import { cn } from "@aevryn/ui/lib/utils";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

// Switches carry their own (required) label for assistive tech; the row
// already shows it, so the switch's copy is visually hidden.
const SWITCH_LABEL_HIDDEN = "[&>span:last-child]:sr-only";

// ---------------------------------------------------------------------------
// Shared row used by settings section panels.
// ---------------------------------------------------------------------------

function SettingRow({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 border-b border-border/60 py-4 last:border-b-0",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] text-foreground">{label}</span>
        {description && (
          <span className="text-[12px] text-muted-foreground">
            {description}
          </span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section panels — placeholder settings built from the library's controls.
// Swap for your own; each row is a label + description on the left and a
// control on the right.
// ---------------------------------------------------------------------------

function WorkspacePanel() {
  const [name, setName] = useState("");
  const [defaultThreadBehavior, setDefaultThreadBehavior] = useState("blank");
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  return (
    <>
      <InputGroup className="w-full">
        <InputField
          index={0}
          label="Workspace name"
          value={name}
          onChange={setName}
          placeholder="Acme Inc"
        />
      </InputGroup>
      <SettingRow
        label="New threads"
        description="What a fresh thread looks like before the first message."
      >
        <Select
          value={defaultThreadBehavior}
          onValueChange={setDefaultThreadBehavior}
          disabled
        >
          <SelectTrigger placeholder="Default style" />
          <SelectContent>
            <SelectItem index={0} value="blank">
              Blank thread
            </SelectItem>
            <SelectItem index={1} value="title-prompt">
              Ask for a title first
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        label="Days of unread activity"
        description="How long a thread can sit idle before it feels stale."
      >
        <Select value="7" onValueChange={() => {}}>
          <SelectTrigger placeholder="7 days" />
          <SelectContent>
            <SelectItem index={0} value="1">
              1 day
            </SelectItem>
            <SelectItem index={1} value="3">
              3 days
            </SelectItem>
            <SelectItem index={2} value="7">
              7 days
            </SelectItem>
            <SelectItem index={3} value="30">
              30 days
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <div className="pt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDeleteWorkspaceOpen(true)}
        >
          Delete workspace
        </Button>
      </div>
      <ConfirmDeleteDialog
        open={deleteWorkspaceOpen}
        onOpenChange={setDeleteWorkspaceOpen}
        title="Delete workspace"
        description="This deletes the workspace and everything inside it. This action cannot be undone."
        actionLabel="Delete workspace"
        items={[{ value: name || "This workspace" }]}
      />
    </>
  );
}

function NotificationsPanel() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    "thread.run.failed": true,
    "thread.run.completed": true,
    "thread.run.approval": true,
    "in-app": true,
    email: false,
  });
  const toggles = [
    {
      id: "thread.run.failed",
      label: "Run failures",
      description: "When a thread run fails and needs attention.",
    },
    {
      id: "thread.run.completed",
      label: "Run completions",
      description: "When a thread run finishes successfully.",
    },
    {
      id: "thread.run.approval",
      label: "Approval requests",
      description: "When a run pauses and waits for your approval.",
    },
    {
      id: "in-app",
      label: "In-app notifications",
      description: "Deliver notifications to the bell in the sidebar.",
    },
    {
      id: "email",
      label: "Email summaries",
      description: "Send a daily digest instead of individual pings.",
    },
  ];
  return (
    <div className="flex flex-col">
      {toggles.map((t) => (
        <SettingRow key={t.id} label={t.label} description={t.description}>
          <Switch
            className={SWITCH_LABEL_HIDDEN}
            label={t.label}
            checked={enabled[t.id] ?? false}
            onToggle={() => setEnabled((e) => ({ ...e, [t.id]: !e[t.id] }))}
          />
        </SettingRow>
      ))}
    </div>
  );
}

function AppearancePanel() {
  const icons = useIcons();
  const { resolvedTheme, setTheme } = useTheme();
  const { size, setSize } = useSizeContext();
  return (
    <div className="flex flex-col">
      <SettingRow
        label="Theme"
        description="Light, dark, or follow the system."
      >
        <Select value={resolvedTheme} onValueChange={setTheme}>
          <SelectTrigger placeholder="Theme" />
          <SelectContent>
            
            <SelectItem index={1} value="light" icon={icons.sun}>
              Light
            </SelectItem>
            <SelectItem index={2} value="dark" icon={icons.moon}>
              Dark
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        label="Density"
        description="Row height across lists, tables, and chat."
      >
        <Select
          value={size}
          onValueChange={(v) => setSize(v as "default" | "compact")}
        >
          <SelectTrigger placeholder="Density" />
          <SelectContent>
            <SelectItem index={0} value="default">
              Default
            </SelectItem>
            <SelectItem index={1} value="compact">
              Compact
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        label="Chat animation"
        description="Show thinking and tool-call motion in chat."
      >
        <Switch
          className={SWITCH_LABEL_HIDDEN}
          label="Chat animation"
          checked={true}
          onToggle={() => {}}
        />
      </SettingRow>
    </div>
  );
}

function SecurityPanel() {
  const [alerts, setAlerts] = useState(true);
  return (
    <div className="flex flex-col">
      <SettingRow
        label="New sign-in alerts"
        description="Email when a new device signs in."
      >
        <Switch
          className={SWITCH_LABEL_HIDDEN}
          label="New sign-in alerts"
          checked={alerts}
          onToggle={() => setAlerts((v) => !v)}
        />
      </SettingRow>
      <SettingRow
        label="Active sessions"
        description="3 devices are signed in right now."
      >
        <Button variant="secondary" size="sm">
          Sign out everywhere
        </Button>
      </SettingRow>
    </div>
  );
}
export type SettingsSectionId =
  | "workspace"
  | "notifications"
  | "appearance"
  | "security";
export function SettingsSectionPanel({ id }: { id: SettingsSectionId }) {
  switch (id) {
    case "workspace":
      return <WorkspacePanel />;
    case "notifications":
      return <NotificationsPanel />;
    case "appearance":
      return <AppearancePanel />;
    case "security":
      return <SecurityPanel />;
  }
}
