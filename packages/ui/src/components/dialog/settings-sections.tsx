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
  const [defaultModel, setDefaultModel] = useState<{
    providerSlug: string;
    modelId: string;
  } | null>(null);
  const [addingModel, setAddingModel] = useState<string | null>(null);
  const [newModelId, setNewModelId] = useState("");
  const [testingSlug, setTestingSlug] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [providersRes, settingsRes] = await Promise.all([
      fetch("/api/providers", { cache: "no-store" }),
      fetch("/api/settings", { cache: "no-store" }),
    ]);
    const json = (await providersRes.json().catch(() => null)) as {
      data?: ProviderRow[];
    } | null;
    if (json?.data) setRows(json.data);
    const settingsJson = (await settingsRes.json().catch(() => null)) as {
      data?: { defaultModel?: { providerSlug: string; modelId: string } | null };
    } | null;
    if (settingsJson?.data) setDefaultModel(settingsJson.data.defaultModel ?? null);
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
    if (defaultModel?.providerSlug === slug) {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultModel: null }),
      });
      setDefaultModel(null);
    }
    await load();
  };

  const setAsDefault = async (
    providerSlug: string,
    modelId: string,
  ) => {
    const isSame =
      defaultModel?.providerSlug === providerSlug &&
      defaultModel?.modelId === modelId;
    const next = isSame ? null : { providerSlug, modelId };
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultModel: next }),
    });
    if (res.ok) setDefaultModel(next);
  };

  const appendModel = async (slug: string) => {
    const modelId = newModelId.trim();
    if (!modelId) return;
    setAddingModel(slug);
    const res = await fetch("/api/providers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, modelId }),
    });
    setAddingModel(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Could not add the model.");
      return;
    }
    setNewModelId("");
    setError(null);
    await load();
  };

  const reorderModel = async (slug: string, from: number, to: number) => {
    const provider = rows.find((r) => r.slug === slug);
    if (!provider) return;
    const next = [...provider.models];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    const res = await fetch("/api/providers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, models: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Could not reorder the models.");
      return;
    }
    setError(null);
    await load();
  };

  const testProvider = async (slug: string, provider: ProviderRow) => {
    const modelId =
      defaultModel?.providerSlug === slug ? defaultModel.modelId : undefined;
    setTestingSlug(slug);
    setTestResult(null);
    const res = await fetch("/api/providers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        modelId: modelId ?? (provider.models[0]?.id ?? undefined),
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { ok?: boolean };
      error?: { message?: string };
    } | null;
    setTestingSlug(null);
    if (!res.ok || !json?.data?.ok) {
      setError(
        json?.error?.message ??
          `Test failed for ${slug} (${provider.models[0]?.id ?? "no model"}).`,
      );
      return;
    }
    setError(null);
    setTestResult(`${slug}: key works`);
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

      {rows.length > 0 && !loading && (
        <div className="mt-2 flex flex-col">
          <span className="text-[13px] text-foreground">
            Per-provider models
          </span>
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 border-b border-border/60 py-4 last:border-b-0"
            >
              {p.models.map((m, mi) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] text-foreground">
                      {m.displayName ?? m.id}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {" "}
                      {p.displayName}{" "}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={mi === 0}
                      onClick={() => void reorderModel(p.slug, mi, mi - 1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={mi === p.models.length - 1}
                      onClick={() => void reorderModel(p.slug, mi, mi + 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant={
                        defaultModel?.providerSlug === p.slug &&
                        defaultModel?.modelId === m.id
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      onClick={() => void setAsDefault(p.slug, m.id)}
                    >
                      {defaultModel?.providerSlug === p.slug &&
                      defaultModel?.modelId === m.id
                        ? "Default"
                        : "Set default"}
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <InputGroup className="w-full">
                  <InputField
                    index={0}
                    label=""
                    value={newModelId}
                    onChange={setNewModelId}
                    placeholder="Add a model id (e.g. openai/gpt-oss-120b)"
                  />
                </InputGroup>{" "}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!newModelId.trim() || addingModel === p.slug}
                  onClick={() => void appendModel(p.slug)}
                >
                  {addingModel === p.slug ? "Adding…" : "Add model"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={testingSlug === p.slug}
                  onClick={() => void testProvider(p.slug, p)}
                >
                  {testingSlug === p.slug ? "Testing…" : "Test key"}
                </Button>
              </div>
            </div>
          ))}
        </div>
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
        {testResult && (
          <p className="text-[12px] text-emerald-600">{testResult}</p>
        )}
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
      <MemorySwitch />
      <p className="pb-4 text-[12px] text-muted-foreground">
        Memories are scoped per conversation: each thread reads and writes its
        own memory only, so context never leaks across chats.
      </p>
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

// --- Memory (real: /api/settings memoryEnabled) ----------------------------

function MemorySwitch() {
  const [value, setValue] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        data?: { memoryEnabled?: boolean | null };
      } | null;
      if (json?.data) setValue(json.data.memoryEnabled ?? null);
    })();
  }, []);

  const toggle = () => {
    if (value === null) return;
    const next = !value;
    setValue(next);
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memoryEnabled: next }),
    });
  };

  if (value === null) {
    return <p className="py-4 text-[13px] text-muted-foreground">Loading…</p>;
  }

  return (
    <SettingRow
      label="Chat memory"
      description="Remember learned facts and recall them across chats via Mem0. Requires a Mem0 API key."
    >
      <Switch
        className={SWITCH_LABEL_HIDDEN}
        label="Chat memory"
        checked={value}
        onToggle={toggle}
      />
    </SettingRow>
  );
}

function WorkspacePanel({
  workspace,
  onMutated,
}: {
  workspace?: { id: string; name: string; isDefault: boolean };
  onMutated?: () => void;
}) {
  const [name, setName] = useState(workspace?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultThreadBehavior, setDefaultThreadBehavior] = useState("blank");
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);

  const saveName = async () => {
    if (!workspace || !name.trim() || name.trim() === workspace.name) return;
    setSavingName(true);
    setError(null);
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(workspace.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      },
    );
    setSavingName(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Could not rename the workspace.");
      return;
    }
    setNameSaved(true);
    onMutated?.();
    window.setTimeout(() => setNameSaved(false), 2000);
  };

  const deleteWorkspace = async () => {
    if (!workspace) return;
    setError(null);
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(workspace.id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setDeleteWorkspaceOpen(false);
      setError(body?.error?.message ?? "Could not delete the workspace.");
      return;
    }
    setDeleteWorkspaceOpen(false);
    onMutated?.();
    window.location.href = "/chat";
  };

  return (
    <>
      {!workspace && (
        <p className="py-4 text-[13px] text-muted-foreground">
          Open a workspace to edit its settings.
        </p>
      )}
      {workspace && (
        <>
          <InputGroup className="w-full">
            <InputField
              index={0}
              label="Workspace name"
              value={name}
              onChange={(v) => {
                setName(v);
                setNameSaved(false);
              }}
              placeholder="Acme Inc"
            />
          </InputGroup>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={
                savingName ||
                !name.trim() ||
                name.trim() === workspace.name
              }
              onClick={() => void saveName()}
            >
              {savingName ? "Saving…" : nameSaved ? "Saved ✓" : "Save name"}
            </Button>
          </div>
        </>
      )}
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
      {workspace && (
        <div className="pt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDeleteWorkspaceOpen(true)}
          >
            Delete workspace
          </Button>
        </div>
      )}
      <ConfirmDeleteDialog
        open={deleteWorkspaceOpen}
        onOpenChange={setDeleteWorkspaceOpen}
        title="Delete workspace"
        description="This deletes the workspace and everything inside it. This action cannot be undone."
        actionLabel="Delete workspace"
        items={[{ value: workspace?.name || "This workspace" }]}
        onConfirm={() => void deleteWorkspace()}
      />
    </>
  );
}

function AppearancePanel() {
  const icons = useIcons();
  const { theme, setTheme } = useTheme();
  const { size, setSize } = useSizeContext();
  const [quality, setQuality] = useState<string>("auto");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        data?: { defaultQuality?: string };
      } | null;
      if (json?.data?.defaultQuality) setQuality(json.data.defaultQuality);
    })();
  }, []);

  const saveQuality = (value: string) => {
    setQuality(value);
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultQuality: value }),
    });
  };

  return (
    <div className="flex flex-col">
      <SettingRow
        label="Theme"
        description="Light, dark, or follow the system."
      >
        <Select value={theme} onValueChange={setTheme}>
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
        label="Default quality"
        description="Output resolution when the model is not told how to think. The composer can still override per-message."
      >
        <Select value={quality} onValueChange={saveQuality}>
          <SelectTrigger placeholder="Quality" />
          <SelectContent>
            <SelectItem index={0} value="auto">
              Auto
            </SelectItem>
            <SelectItem index={1} value="high">
              High
            </SelectItem>
            <SelectItem index={2} value="medium">
              Medium
            </SelectItem>
            <SelectItem index={3} value="low">
              Low
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
export type SettingsSectionId =
  | "workspace"
  | "models"
  | "byok"
  | "notifications"
  | "appearance"
  | "security";

export interface SettingsSectionPanelProps {
  id: SettingsSectionId;
  workspace?: { id: string; name: string; isDefault: boolean };
  onWorkspaceMutated?: () => void;
}

export function SettingsSectionPanel({
  id,
  workspace,
  onWorkspaceMutated,
}: SettingsSectionPanelProps) {
  switch (id) {
    case "workspace":
      return (
        <WorkspacePanel workspace={workspace} onMutated={onWorkspaceMutated} />
      );
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
