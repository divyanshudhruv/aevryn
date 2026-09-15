"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { InputGroup, InputField } from "../ui/input-group";
import { Select, SelectTrigger, SelectContent, SelectItem } from "../ui/select";
import { Switch } from "../ui/switch";
import { useIcons } from "@aevryn/ui/lib/icon-context";
import { useSizeContext } from "@aevryn/ui/lib/size-context";
import { useTheme } from "next-themes";
import { cn } from "@aevryn/ui/lib/utils";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { SidebarMenuSkeleton } from "../ui/sidebar-menu";

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

// --- Models (real: /api/providers) -----------------------------------------

interface ProviderRow {
  id: string;
  slug: string;
  displayName: string;
  baseUrl: string;
  models: Array<{ id: string; displayName?: string }>;
}

const PROVIDER_PRESETS: Record<
  string,
  { displayName: string; baseUrl: string; models: string }
> = {
  groq: {
    displayName: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: "llama-3.3-70b-versatile, llama-3.1-8b-instant",
  },
  custom: { displayName: "", baseUrl: "", models: "" },
};

function ModelsPanel() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("groq");
  const [displayName, setDisplayName] = useState(
    PROVIDER_PRESETS["groq"]?.displayName ?? "",
  );
  const [baseUrl, setBaseUrl] = useState(
    PROVIDER_PRESETS["groq"]?.baseUrl ?? "",
  );
  const [apiKey, setApiKey] = useState("");
  const [modelsText, setModelsText] = useState(
    PROVIDER_PRESETS["groq"]?.models ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/providers", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as {
      data?: ProviderRow[];
    } | null;
    if (json?.data) setRows(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (key: string) => {
    setPreset(key);
    const p = PROVIDER_PRESETS[key];
    if (p) {
      setDisplayName(p.displayName);
      setBaseUrl(p.baseUrl);
      setModelsText(p.models);
    }
  };

  const save = async () => {
    setError(null);
    const models = modelsText
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .map((id) => ({ id }));
    if (
      !displayName.trim() ||
      !baseUrl.trim() ||
      !apiKey.trim() ||
      models.length === 0
    ) {
      setError(
        "Fill in the name, base URL, API key, and at least one model id.",
      );
      return;
    }
    const slug =
      preset === "custom"
        ? displayName.trim().toLowerCase().replace(/\s+/g, "-")
        : preset;
    setSaving(true);
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        displayName: displayName.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        models,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Could not save the provider.");
      return;
    }
    setApiKey("");
    await load();
  };

  const remove = async (slug: string) => {
    await fetch(`/api/providers?slug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    await load();
  };

  return (
    <div className="flex flex-col">
      {loading ? (
        <div className=" flex flex-col">
          <SidebarMenuSkeleton />
          <SidebarMenuSkeleton showIcon />
          <SidebarMenuSkeleton />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-[13px] text-muted-foreground">
          No model providers yet. Add one below to start chatting.
        </p>
      ) : (
        rows.map((p) => (
          <SettingRow
            key={p.id}
            label={`${p.displayName} (${p.slug})`}
            description={`${p.models.map((m) => m.id).join(", ")} - ${p.baseUrl}`}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void remove(p.slug)}
            >
              Remove
            </Button>
          </SettingRow>
        ))
      )}

      <div className="mt-6 flex flex-col gap-3">
        <span className="text-[13px] text-foreground">Add a provider</span>
        <div className="w-full">
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger placeholder="Preset" />
            <SelectContent>
              <SelectItem index={0} value="groq">
                Groq
              </SelectItem>
              <SelectItem index={1} value="custom">
                Custom (OpenAI-compatible)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <InputGroup className="w-full">
          <InputField
            index={0}
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Groq"
          />
          <InputField
            index={1}
            label="Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://api.groq.com/openai/v1"
          />
          <InputField
            index={2}
            label="API key"
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder="gsk_…"
          />
          <InputField
            index={3}
            label="Model ids"
            value={modelsText}
            onChange={setModelsText}
            placeholder="llama-3.3-70b-versatile"
          />
        </InputGroup>
        {error && <p className="text-[12px] text-destructive">{error}</p>}
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save provider"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- BYOK (real: /api/keys) ------------------------------------------------

const BYOK_KEYS = [
  {
    name: "anakin" as const,
    label: "Anakin API key",
    description:
      "Unlocks Anakin scrape, crawl, research, Wire writes, and higher rate limits.",
    placeholder: "ak_…",
  },
  {
    name: "mem0" as const,
    label: "Mem0 API key",
    description: "Enables per-chat long-term memory recall and storage.",
    placeholder: "m0-…",
  },
];

function ByokPanel() {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/keys", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as {
      data?: Array<{ name: string }>;
    } | null;
    const next: Record<string, boolean> = {};
    for (const k of BYOK_KEYS) next[k.name] = false;
    for (const row of json?.data ?? []) next[row.name] = true;
    setSaved(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (name: string) => {
    const value = (drafts[name] ?? "").trim();
    if (!value) return;
    setBusy(name);
    await fetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, value }),
    });
    setDrafts((d) => ({ ...d, [name]: "" }));
    setBusy(null);
    await load();
  };

  const remove = async (name: string) => {
    setBusy(name);
    await fetch(`/api/keys?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    setBusy(null);
    await load();
  };

  if (loading) {
    return (
      <div className="mt-2">
        <SidebarMenuSkeleton showIcon />
        <SidebarMenuSkeleton />
        <SidebarMenuSkeleton />
        <SidebarMenuSkeleton />
        <SidebarMenuSkeleton showIcon />
        <SidebarMenuSkeleton />
        <SidebarMenuSkeleton />
        <SidebarMenuSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {BYOK_KEYS.map((k) => (
        <div
          key={k.name}
          className="flex flex-col gap-2 border-b border-border/60 py-4 last:border-b-0"
        >
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[13px] text-foreground">
                {k.label}
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    saved[k.name] ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                />
              </span>
              <span className="text-[12px] text-muted-foreground">
                {k.description}
              </span>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <InputGroup className="w-full">
              <InputField
                index={0}
                label=""
                type="password"
                value={drafts[k.name] ?? ""}
                onChange={(value) =>
                  setDrafts((d) => ({ ...d, [k.name]: value }))
                }
                placeholder={saved[k.name] ? "•••••••• (saved)" : k.placeholder}
              />
            </InputGroup>{" "}
            {saved[k.name] && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy === k.name}
                onClick={() => void remove(k.name)}
              >
                Remove
              </Button>
            )}
            <Button
              size="sm"
              disabled={!(drafts[k.name] ?? "").trim() || busy === k.name}
              onClick={() => void save(k.name)}
            >
              {busy === k.name ? "Saving…" : saved[k.name] ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Notifications (real: /api/settings) -----------------------------------

interface NotificationsData {
  runFailed: boolean;
  runCompleted: boolean;
  runApproval: boolean;
}

function NotificationsPanel() {
  const [data, setData] = useState<NotificationsData | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        data?: { notifications?: NotificationsData };
      } | null;
      if (json?.data?.notifications) setData(json.data.notifications);
    })();
  }, []);

  const toggle = (key: keyof NotificationsData) => {
    if (!data) return;
    const next = { ...data, [key]: !data[key] };
    setData(next);
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notifications: { [key]: next[key] } }),
    });
  };

  if (!data) {
    return <p className="py-4 text-[13px] text-muted-foreground">Loading…</p>;
  }

  const toggles: Array<{
    key: keyof NotificationsData;
    label: string;
    description: string;
  }> = [
    {
      key: "runFailed",
      label: "Run failures",
      description: "When a thread run fails and needs attention.",
    },
    {
      key: "runCompleted",
      label: "Run completions",
      description: "When a thread run finishes successfully.",
    },
    {
      key: "runApproval",
      label: "Approval requests",
      description: "When a run pauses and waits for your approval.",
    },
  ];

  return (
    <div className="flex flex-col">
      {toggles.map((t) => (
        <SettingRow key={t.key} label={t.label} description={t.description}>
          <Switch
            className={SWITCH_LABEL_HIDDEN}
            label={t.label}
            checked={data[t.key]}
            onToggle={() => toggle(t.key)}
          />
        </SettingRow>
      ))}
    </div>
  );
}

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
        <Select value="7" onValueChange={() => {}} disabled>
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
          disabled
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
  | "models"
  | "byok"
  | "notifications"
  | "appearance"
  | "security";
export function SettingsSectionPanel({ id }: { id: SettingsSectionId }) {
  switch (id) {
    case "workspace":
      return <WorkspacePanel />;
    case "models":
      return <ModelsPanel />;
    case "byok":
      return <ByokPanel />;
    case "notifications":
      return <NotificationsPanel />;
    case "appearance":
      return <AppearancePanel />;
    case "security":
      return <SecurityPanel />;
  }
}
