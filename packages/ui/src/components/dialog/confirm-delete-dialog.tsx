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
import { InputCopy } from "../../components/ui/input-copy";

export interface ConfirmDeleteDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Heading shown above the item list. */
  title: string;
  /** Body text explaining what will happen. */
  description: string;
  /** Label on the destructive primary button. */
  actionLabel: string;
  /** Items shown in the confirmation list (thread/group names). */
  items: Array<{ value: string }>;
  /** Called when the user confirms. The dialog does not close itself. */
  onConfirm?: () => void;
  /** When true, the primary button shows a spinner and is disabled. */
  loading?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  defaultOpen,
  onOpenChange,
  title,
  description,
  actionLabel,
  items,
  onConfirm,
  loading = false,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
          <Button
            loading={loading}
            onClick={onConfirm}
            disabled={loading}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
