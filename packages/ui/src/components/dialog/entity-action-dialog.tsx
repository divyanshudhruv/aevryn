"use client";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "../../components/ui/dialog";
import { useState } from "react";
import { Pencil, Brain, ListPlus, type LucideIcon } from "lucide-react";
import { InputGroup, InputField } from "../../components/ui/input-group";

/** Which entity the dialog acts on. */
export type EntityActionMode =
  | "rename-workflow"
  | "rename-section"
  | "add-memory"
  | "add-plan";

interface ModeConfig {
  title: string;
  description: string;
  placeholder: string;
  icon: LucideIcon;
  actionLabel: string;
}

const MODE_CONFIG: Record<EntityActionMode, ModeConfig> = {
  "rename-workflow": {
    title: "Rename workflow",
    description: "Enter a new name for this workflow.",
    placeholder: "Enter new workflow name",
    icon: Pencil,
    actionLabel: "Rename",
  },
  "rename-section": {
    title: "Rename section",
    description: "Enter a new name for this section.",
    placeholder: "Enter new section name",
    icon: Pencil,
    actionLabel: "Rename",
  },
  "add-memory": {
    title: "Create a new memory",
    description: "Enter a new memory for this workflow.",
    placeholder: "Enter memory content",
    icon: Brain,
    actionLabel: "Add Memory",
  },
  "add-plan": {
    title: "Create a plan step",
    description: "Enter a new step to this plan.",
    placeholder: "Enter step summary",
    icon: ListPlus,
    actionLabel: "Add Step",
  },
};

export interface EntityActionDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Drives the texts, icon, and label for the target entity. */
  mode: EntityActionMode;
  /** Initial input value. */
  defaultValue?: string;
  /** Called with the current input value when the primary action is pressed. */
  onSubmit?: (value: string) => void;
}

export function EntityActionDialog({
  mode,
  open,
  defaultOpen,
  onOpenChange,
  defaultValue = "",
  onSubmit,
}: EntityActionDialogProps) {
  const config = MODE_CONFIG[mode];
  const [value, setValue] = useState(defaultValue);

  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <InputGroup className="w-full max-w-full">
          <InputField
            index={0}
            label=""
            placeholder={config.placeholder}
            icon={config.icon}
            value={value}
            onChange={setValue}
          />
        </InputGroup>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button onClick={() => onSubmit?.(value)}>
            {config.actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
