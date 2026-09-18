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

const DEFAULT_DELETIONS: Record<DeleteMode, Array<{ value: string }>> = {
  "delete-all": [
    { value: "New pricing page workflow" },
    { value: "Component library audit" },
    { value: "Dark mode token pass" },
  ],
  "delete-one": [{ value: "Component library audit" }],
};

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

export interface WorkflowDelConfirmationDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  mode?: DeleteMode;
  /** When supplied, renders the listed deletions instead of the mode defaults. */
  deletions?: Array<{ value: string }>;
  /** Called when the primary action is pressed. The dialog is not closed by this prop. */
  onConfirm?: () => void;
  /** When true, the primary button shows a spinner and is disabled. */
  loading?: boolean;
}

export function WorkflowDelConfirmationDialog({
  open,
  defaultOpen,
  onOpenChange,
  mode = "delete-one",
  deletions,
  onConfirm,
  loading = false,
}: WorkflowDelConfirmationDialogProps) {
  const texts = TEXTS[mode];
  const items = deletions ?? DEFAULT_DELETIONS[mode];

  if (items.length === 0) {
    return (
      <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{texts.title}</DialogTitle>
            <DialogDescription>{texts.description}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            There is nothing to delete.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>{texts.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-0">
          {items.map((item) => (
            <InputCopy
              key={item.value}
              value={item.value}
              className="truncate"
              disabled
            />
          ))}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button onClick={onConfirm} loading={loading} disabled={loading}>
            {texts.actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}