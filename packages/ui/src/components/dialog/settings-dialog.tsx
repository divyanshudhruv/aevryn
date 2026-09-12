"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@aevryn/ui/components/ui/dialog";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@aevryn/ui/components/ui/sidebar";
import { ScrollArea } from "@aevryn/ui/components/ui/scroll-area";
import { Button } from "@aevryn/ui/components/ui/button";
import { Switch } from "@aevryn/ui/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@aevryn/ui/components/ui/select";
import { InputGroup, InputField } from "@aevryn/ui/components/ui/input-group";
import { useIcons, type IconName } from "@aevryn/ui/lib/icon-context";
import { useSizeContext } from "@aevryn/ui/lib/size-context";
import { useTheme } from "next-themes";
import { cn } from "@aevryn/ui/lib/utils";
import { fontWeights } from "@aevryn/ui/lib/font-weight";

// ---------------------------------------------------------------------------
// A settings dialog: the `xl` Dialog as a canvas, a non-collapsing Sidebar
// of sections down its left edge, and a scrolling panel for the section's
// controls. The sidebar is the same composable Sidebar the app shell uses —
// it just lives in a bounded frame: `collapsible="none"` drops the rail and
// the drawer, the provider is told not to persist or listen for the
// shortcut, and `h-full` pins both to the dialog's fixed height.
//
// Below the `sm` breakpoint the column would leave no room for the panel,
// so it hides and a Select at the top of the panel takes over navigation.
// ---------------------------------------------------------------------------

interface SettingsSection {
  id: string;
  label: string;
  icon: IconName;
  description: string;
}

const SECTIONS: SettingsSection[] = [
  {
    id: "general",
    label: "General",
    icon: "settings",
    description: "Workspace name, language, and region.",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "bell",
    description: "What reaches your inbox and when.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: "palette",
    description: "Theme and density for this device.",
  },
  {
    id: "security",
    label: "Security",
    icon: "shield",
    description: "Sign-in protection and active sessions.",
  },
];

export interface SettingsDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The section shown first. @default "general" */
  defaultSection?: string;
}

export function SettingsDialog({
  open,
  defaultOpen,
  onOpenChange,
  defaultSection = "general",
}: SettingsDialogProps) {
  const icons = useIcons();
  const [section, setSection] = useState(defaultSection);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        // The dialog's padding and centering give way to the two-column
        // shell; the height is fixed so the panel scrolls inside it.
        className="flex h-[min(640px,calc(100dvh-4rem))] overflow-hidden p-0"
      >
        <SidebarProvider
          persist={false}
          shortcut={null}
          width="13rem"
          className="h-full min-h-0"
        >
          <Sidebar
            collapsible="none"
            className="hidden h-full sm:flex bg-[rgb(var(--overlay)/0.03)]"
          >
            <SidebarHeader className="px-4 pt-5 pb-2">
              {/* Headings here are labels, not a headline: the dialog's own
                  title weight would out-shout the nav beneath it. */}
              <DialogTitle
                style={{ fontVariationSettings: fontWeights.normal }}
              >
                Settings
              </DialogTitle>
              <DialogDescription className="sr-only">
                Workspace and account settings.
              </DialogDescription>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                {/* Rows are the whole surface here; keyboard focus moves the
                    highlight instead of drawing a ring. */}
                <SidebarMenu focusRing={false} className="gap-px">
                  {SECTIONS.map((s) => (
                    <SidebarMenuItem key={s.id}>
                      <SidebarMenuButton
                        icon={icons[s.icon]}
                        isActive={s.id === section}
                        onClick={() => setSection(s.id)}
                      >
                        {s.label}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Panel header — pr-12 keeps clear of the dialog's ✕. */}
            <div className="flex shrink-0 flex-col gap-1 px-6 pt-5 pb-4 pr-12">
              <div className="sm:hidden">
                {/* The dialog's one DialogTitle lives in the sidebar header
                    (a referenced title names the dialog even while hidden);
                    this is the visible heading for narrow screens. */}
                <h2
                  className="mb-3 text-[16px] leading-tight text-foreground"
                  style={{ fontVariationSettings: fontWeights.normal }}
                >
                  Settings
                </h2>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger placeholder="Section" />
                  <SelectContent>
                    {SECTIONS.map((s, i) => (
                      <SelectItem
                        key={s.id}
                        index={i}
                        value={s.id}
                        icon={icons[s.icon]}
                      >
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <h3
                className="hidden text-[16px] leading-tight text-foreground sm:block"
                style={{ fontVariationSettings: fontWeights.normal }}
              >
                {current?.label}
              </h3>
              <p className="hidden text-[13px] text-muted-foreground sm:block">
                {current?.description}
              </p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-6 px-6 pb-6">
                <SectionPanel id={current?.id as string} />
              </div>
            </ScrollArea>
          </div>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Section panels — placeholder settings built from the library's controls.
// Swap for your own; each row is a label + description on the left and a
// control on the right.
// ---------------------------------------------------------------------------

// Switches carry their own (required) label for assistive tech; the row
// already shows it, so the switch's copy is visually hidden.
const SWITCH_LABEL_HIDDEN = "[&>span:last-child]:sr-only";

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

function SectionPanel({ id }: { id: string }) {
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
