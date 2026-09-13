"use client";

import { useState } from "react";
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
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@aevryn/ui/components/ui/select";
import { useIcons, type IconName } from "@aevryn/ui/lib/icon-context";
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

type WorkflowSectionId = "general" | "plan" | "instructions" | "memories";

interface WorkflowSection {
  id: WorkflowSectionId;
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
  defaultSection?: WorkflowSectionId;
}

export function WorkflowDialog({
  open,
  defaultOpen,
  onOpenChange,
  defaultSection = "general",
}: WorkflowDialogProps) {
  const icons = useIcons();
  const [section, setSection] = useState<WorkflowSectionId>(defaultSection);
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
                <Select
          value={section}
          onValueChange={(value: string) => setSection(value as WorkflowSectionId)}
        >
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
                {current && <WorkflowSectionPanel id={current.id} />}
              </div>
            </ScrollArea>
          </div>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}

import { WorkflowSectionPanel } from "./workflow-sections";
