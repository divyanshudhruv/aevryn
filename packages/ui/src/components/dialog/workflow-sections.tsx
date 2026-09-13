"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { InputGroup, InputField } from "../ui/input-group";
import { Switch } from "../ui/switch";
import { EntityActionDialog } from "./entity-action-dialog";
import { WorkflowDelConfirmationDialog } from "./workflow-del-confirmation-dialog";
import { ArrowUp, ArrowDown } from "lucide-react";
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
// Section panels — placeholder settings built from the library's controls.
// Swap for your own; each row is a label + description on the left and a
// control on the right.
// ---------------------------------------------------------------------------

function GeneralPanel() {
  const [name, setName] = useState("Acme Inc");
  const [description, setDescription] = useState("A long description");
  const [deleteWorkflowOpen, setDeleteWorkflowOpen] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);

  return (
    <>
      <WorkflowDelConfirmationDialog
        open={deleteWorkflowOpen}
        onOpenChange={setDeleteWorkflowOpen}
        mode="delete-one"
      />
      <InputGroup className="w-full">
        <InputField
          index={0}
          label="Workflow name"
          value={name}
          onChange={setName}
          placeholder="Component audit library"
        />
        <InputField
          index={1}
          label="Workflow Description"
          value={description}
          onChange={setDescription}
          placeholder="Describe your workflow"
        />
      </InputGroup>
      <div>
        {" "}
        <SettingRow
          label="Auto approve"
          description="Automatically approve workflows without manual review."
        >
          <Switch
            label={autoApprove ? "Enabled" : "Disabled"}
            checked={autoApprove}
            onToggle={() => setAutoApprove((prev) => !prev)}
          />
        </SettingRow>
      </div>
      <div className="pt-0 ">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDeleteWorkflowOpen(true)}
        >
          Delete workflow
        </Button>
      </div>
    </>
  );
}

function PlanPanel() {
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const items = [
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
        "Collaborate with stakeholders to gather project requirements. Conduct user research to understand user needs and preferences. Create a user persona and user journey map.",
    },
    {
      id: "plan_step_3",
      title: "Design the project plan and wireframes",
      content:
        "Create a detailed project plan, including task assignments, timelines, and dependencies. Design wireframes to visualize the project's user interface.",
    },
    {
      id: "plan_step_4",
      title: "Develop the project codebase",
      content:
        "Write clean, modular, and testable code. Implement the project's features and functionality. Test the code thoroughly to ensure quality and reliability.",
    },
    {
      id: "plan_step_5",
      title: "Deploy the project and conduct testing",
      content:
        "Deploy the project to a production environment. Conduct thorough testing to ensure compatibility and performance. Fix any bugs or issues identified during testing.",
    },
    {
      id: "plan_step_6",
      title: "Launch the project and provide ongoing support",
      content:
        "Launch the project to users. Provide ongoing support and maintenance to ensure smooth operation and bug fixes. Continuously gather feedback and improve the project over time.",
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex flex-col">
        {items.map((m) => (
          <SettingRow key={m.id} label={m.id} description={m.content}>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="icon-compact">
                <ArrowUp />
              </Button>
              <Button variant="secondary" size="icon-compact">
                <ArrowDown />
              </Button>
              <Button variant="secondary" size="sm">
                Remove
              </Button>
            </div>
          </SettingRow>
        ))}
      </div>

      <div className="pt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAddPlanOpen(true)}
        >
          Add steps
        </Button>
      </div>
      <EntityActionDialog
        open={addPlanOpen}
        onOpenChange={setAddPlanOpen}
        mode="add-plan"
        loading={creatingPlan}
      />
    </div>
  );
}

function InstructionsPanel() {
  const [systemPrompt, setSystemPrompt] = useState("");
  return (
    <div className="flex flex-col">
      <InputGroup className="w-full">
        <InputField
          index={0}
          label="System prompt"
          value={systemPrompt}
          onChange={setSystemPrompt}
          placeholder="Write a detailed system prompt for the LLM"
        />
      </InputGroup>
    </div>
  );
}

function MemoriesPanel() {
  const [addMemoryOpen, setAddMemoryOpen] = useState(false);
  const [creatingMemory, setCreatingMemory] = useState(false);
  const MEMORIES = [
    {
      id: "mem_Xsi300KDxwaa",
      description:
        "The user wants to know how to create a landing page for their new startup. They should use a website builder like Wix or Squarespace to create a professional-looking website.",
    },
    {
      id: "mem_Ytr450LFmnb",
      description:
        "The user wants to know how to create a professional-looking resume. They should use a resume builder like LinkedIn or Resume.io to create a polished and compelling resume.",
    },
    {
      id: "mem_Zuv670PHklo",
      description:
        "The user wants to know how to set up a social media marketing campaign for their business. They should use a social media management tool like Hootsuite or Buffer to create and schedule posts on all of their social media channels.",
    },
  ];
  return (
    <div className="flex flex-col">
      {/* <InputGroup className="w-full">
        <InputField
          index={0}
          label="Create a new memory"
          value={""}
          onChange={() => {}}
          placeholder="Write a detailed system prompt for the LLM"
        />
      </InputGroup> */}
      <div className="flex flex-col">
        {/* <span className="font-[13px] text-muted-foreground">
          Existing memories
        </span> */}
        {MEMORIES.map((m) => (
          <SettingRow key={m.id} label={m.id} description={m.description}>
            <Button variant="secondary" size="sm">
              Remove
            </Button>
          </SettingRow>
        ))}
      </div>
      <div className="pt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAddMemoryOpen(true)}
        >
          Add memory
        </Button>
      </div>
      <EntityActionDialog
        open={addMemoryOpen}
        onOpenChange={setAddMemoryOpen}
        mode="add-memory"
        loading={creatingMemory}
      />
    </div>
  );
}

export type WorkflowSectionId = "general" | "plan" | "instructions" | "memories";

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
