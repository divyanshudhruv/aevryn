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
import { InputCopy } from "../../components/ui/input-copy";

/** Which deletion the dialog confirms. */
export type DeleteMode = "delete-all" | "delete-one";

const MOCK_SECTION_WORKFLOWS = [
  { value: "New pricing page workflow" },
  { value: "Component library audit" },
  { value: "Dark mode token pass" },
];

const MOCK_ONE_WORKFLOW = [{ value: "Component library audit" }];

const TEXTS: Record<
  DeleteMode,
  { title: string; description: string; actionLabel: string }
> = {
  "delete-all": {
    title: "Delete section",
    description:
      "Are you sure you want to delete all workflows in this section? This action cannot be undone.",
    actionLabel: "Delete all",
  },
  "delete-one": {
    title: "Delete workflow",
    description:
      "Are you sure you want to delete this workflow? This action cannot be undone.",
    actionLabel: "Delete",
  },
};

export function WorkflowDelConfirmationDialog({
  open,
  defaultOpen,
  onOpenChange,
  mode = "delete-one",
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Drives the title, description, action label, and listed workflows. */
  mode?: DeleteMode;
}) {
  const texts = TEXTS[mode];
  const workflows =
    mode === "delete-all" ? MOCK_SECTION_WORKFLOWS : MOCK_ONE_WORKFLOW;

  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>{texts.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-0">
          {workflows.map((w) => (
            <InputCopy key={w.value} value={w.value} className="truncate" disabled />
          ))}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button>{texts.actionLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}