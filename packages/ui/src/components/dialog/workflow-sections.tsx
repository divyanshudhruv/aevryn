"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { InputGroup, InputField } from "../ui/input-group";
import { Switch } from "../ui/switch";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { ArrowUp, ArrowDown, Key, Plus, Trash2 } from "lucide-react";
import { cn } from "@aevryn/ui/lib/utils";

// ---------------------------------------------------------------------------
// Shared row used by workflow section panels.
// ---------------------------------------------------------------------------

function SettingRow({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string | ReactNode;
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
          <div className="w-full text-[12px] text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section panels.
// ---------------------------------------------------------------------------

function GeneralPanel() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [deleteWorkflowOpen, setDeleteWorkflowOpen] = useState(false);

  return (
    <>
      <ConfirmDeleteDialog
        open={deleteWorkflowOpen}
        onOpenChange={setDeleteWorkflowOpen}
        title="Delete workflow"
        description="This deletes the workflow and its plan. Threads that are bound to it will keep running with their last saved instructions."
        actionLabel="Delete workflow"
        items={[{ value: name || "This workflow" }]}
      />
      <InputGroup className="w-full">
        <InputField
          label="Name"
          value={name}
          onChange={(e) => setName(e)}
          placeholder="e.g. My workflow"
          index={0}
        />
        <InputField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e)}
          placeholder="Describe what this workflow does"
          index={1}
        />
      </InputGroup>
      <div>
        {" "}
        <SettingRow
          label="Auto approve"
          description="Let this workflow run without asking first when it uses known safe tools."
        >
          <Switch
            label={autoApprove ? "On" : "Off"}
            checked={autoApprove}
            onToggle={() => setAutoApprove((prev) => !prev)}
          />
        </SettingRow>
      </div>
    </>
  );
}

function PlanPanel() {
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [items, setItems] = useState([
    {
      id: "plan_step_1",
      title: "Outline project scope and goals",
      content:
        "Define the purpose and objectives of the project. Identify the key stakeholders and their roles. Determine the project timeline and milestones.",
    },
    {
      id: "plan_step_2",
      title: "Gather requirements and conduct user research",
      content:
        "Collaborate with stakeholders to gather project requirements. Conduct user research to understand user needs and preferences.",
    },
    {
      id: "plan_step_3",
      title: "Design the project plan and wireframes",
      content:
        "Create a detailed project plan, including task assignments, timelines, and dependencies.",
    },
  ]);

  const moveItem = (from: number, to: number) => {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setItems(next);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  return (
    <div className="flex flex-col">
      {items.length === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">No steps yet.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((item, index) => (
            <SettingRow
              key={item.id}
              label={item.title}
              description={item.content}
            >
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="icon-compact"
                  disabled={index === 0}
                  onClick={() => moveItem(index, index - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="secondary"
                  size="icon-compact"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, index + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => removeItem(item.id)}
                >
                  Remove
                </Button>
              </div>
            </SettingRow>
          ))}
          <div className="pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddPlanOpen(true)}
            >
              Add step
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InstructionsPanel() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userInstructions, setUserInstructions] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <InputGroup className="w-full">
        <InputField
          index={0}
          label="System prompt"
          value={systemPrompt}
          onChange={setSystemPrompt}
          placeholder="You are a careful research assistant. Prefer concise answers with citations."
        />
      </InputGroup>
      <InputGroup className="w-full">
        <InputField
          index={0}
          label="User instructions"
          value={userInstructions}
          onChange={setUserInstructions}
          placeholder="Extra rules for this workflow, such as tone, format, or things to avoid."
        />
      </InputGroup>
    </div>
  );
}
function MemoriesPanel() {
  const [memories, setMemories] = useState([
    {
      id: "mem_research_style",
      title: "Research style",
      description:
        "Prefer recent primary sources, and always keep a citation for each factual claim.",
      status: "active",
    },
    {
      id: "mem_comparison_rules",
      title: "Comparison rules",
      description:
        "When comparing products, always include price, pros, cons, and a short recommendation.",
      status: "active",
    },
    {
      id: "mem_user_goals",
      title: "User goals",
      description:
        "The user cares more about long-term maintainability than raw benchmark numbers.",
      status: "draft",
    },
  ]);

  return (
    <div className="flex flex-col">
      {memories.map((item, index) => (
        <SettingRow
          key={item.id}
          label={item.id}
          description={item.description}
        >
          <Button variant="secondary" size="sm">
            Remove
          </Button>
        </SettingRow>
      ))}
    </div>
  );
}

export type WorkflowSectionId =
  | "general"
  | "plan"
  | "instructions"
  | "memories"
  | "keys";

export function WorkflowSectionPanel({ id }: { id: WorkflowSectionId }) {
  switch (id) {
    case "plan":
      return <PlanPanel />;
    case "instructions":
      return <InstructionsPanel />;
    case "memories":
      return <MemoriesPanel />;
    default:
      return <GeneralPanel />;
  }
}

// ---------------------------------------------------------------------------
// Small dialog reuse for add/edit flows.
// These reuse EntityActionDialog as a placeholder keyed-text dialog. When the
// real add/edit forms are ready, replace them with dedicated dialogs that
// collect title + description for memories, and provider + label + model + key
// for API keys.
// ---------------------------------------------------------------------------

interface MemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  loading?: boolean;
  mode?: "add" | "edit";
}

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  loading?: boolean;
  mode?: "add" | "edit";
}
