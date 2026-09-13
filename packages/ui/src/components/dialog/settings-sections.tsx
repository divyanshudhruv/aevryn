"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { InputGroup, InputField } from "../ui/input-group";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { useIcons } from "@aevryn/ui/lib/icon-context";
import { useSizeContext } from "@aevryn/ui/lib/size-context";
import { useTheme } from "next-themes";
import { cn } from "@aevryn/ui/lib/utils";

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

function GeneralPanel() {
  const [name, setName] = useState("Acme Inc");
  const [timezone, setTimezone] = useState("utc+1");
  const [telemetry, setTelemetry] = useState(false);
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
      <div className="flex flex-col">
        <SettingRow
          label="Telemetry"
          description="Help us improve by sharing usage data."
        >
          <Switch
            label={telemetry ? "Enabled" : "Disabled"}
            checked={telemetry}
            onToggle={() => setTelemetry((prev) => !prev)}
          />
        </SettingRow>
        <SettingRow
          label="Timezone"
          description="Dates and reminders follow it."
        >
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger placeholder="Timezone" />
            <SelectContent>
              <SelectItem index={0} value="utc-8">
                (UTC−8) Pacific
              </SelectItem>
              <SelectItem index={1} value="utc-5">
                (UTC−5) Eastern
              </SelectItem>
              <SelectItem index={2} value="utc+0">
                (UTC+0) London
              </SelectItem>
              <SelectItem index={3} value="utc+1">
                (UTC+1) Paris
              </SelectItem>
              <SelectItem index={4} value="utc+9">
                (UTC+9) Tokyo
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </>
  );
}

function NotificationsPanel() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    "workflow.failed": true,
    "schedule.started": true,
    alert: true,
    webhook: false,
    "in-app": true,
  });
  const toggles = [
    {
      id: "workflow.failed",
      label: "Workflow failures",
      description: "When a workflow run fails and needs attention.",
    },
    {
      id: "schedule.started",
      label: "Scheduled runs",
      description: "When a scheduled workflow run starts.",
    },
    {
      id: "alert",
      label: "Agent alerts",
      description: "When an agent sends an alert notification.",
    },
    {
      id: "webhook",
      label: "Webhooks",
      description: "When the agent posts to an external webhook URL.",
    },
    {
      id: "in-app",
      label: "In-app notifications",
      description: "Deliver to the notification bell.",
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
            onToggle={() =>
              setEnabled((e) => ({ ...e, [t.id]: !e[t.id] }))
            }
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
        description="Follows the system unless you pick one."
      >
        <Select value={resolvedTheme} onValueChange={setTheme}>
          <SelectTrigger placeholder="Theme" />
          <SelectContent>
            <SelectItem index={0} value="system" icon={icons.monitor}>
              System
            </SelectItem>
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
        description="Row height across lists and tables."
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

export type SettingsSectionId = "general" | "notifications" | "appearance" | "security";

export function SettingsSectionPanel({ id }: { id: SettingsSectionId }) {
  switch (id) {
    case "notifications":
      return <NotificationsPanel />;
    case "appearance":
      return <AppearancePanel />;
    case "security":
      return <SecurityPanel />;
    default:
      return <GeneralPanel />;
  }
}
