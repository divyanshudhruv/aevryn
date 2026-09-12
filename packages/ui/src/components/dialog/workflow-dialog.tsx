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
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@aevryn/ui/components/ui/select";
import { InputGroup, InputField } from "@aevryn/ui/components/ui/input-group";
import { useIcons, type IconName } from "@aevryn/ui/lib/icon-context";
import { cn } from "@aevryn/ui/lib/utils";
import { fontWeights } from "@aevryn/ui/lib/font-weight";
import { WorkflowDelConfirmationDialog } from "./workflow-del-confirmation-dialog";
import { EntityActionDialog } from "./entity-action-dialog";
import {
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Switch } from "../ui/switch";

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

interface WorkflowSection {
  id: string;
  label: string;
  icon: IconName;
  description: string;
}

const SECTIONS: WorkflowSection[] = [
  {
    id: "general",
    label: "General",
    icon: "settings",
    description: "General settings for this workflow.",
  },
  {
    id: "plan",
    label: "Plan",
    icon: "notebook",
    description: "Manage your workflow plan.",
  },
  {
    id: "instructions",
    label: "Instructions",
    icon: "bot",
    description: "Add instructions and system-prompts for your workflow.",
  },
  {
    id: "memories",
    label: "Memories",
    icon: "database",
    description: "View and manage memories for your workflow.",
  },
];

export interface WorkflowDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The section shown first. @default "general" */
  defaultSection?: string;
}

export function WorkflowDialog({
  open,
  defaultOpen,
  onOpenChange,
  defaultSection = "general",
}: WorkflowDialogProps) {
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
                About
              </DialogTitle>
              <DialogDescription className="sr-only">
                Workflow settings.
              </DialogDescription>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Workflow</SidebarGroupLabel>
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
                  Workflow
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

function SectionPanel({ id }: { id: string }) {
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
      />
    </div>
  );
}
