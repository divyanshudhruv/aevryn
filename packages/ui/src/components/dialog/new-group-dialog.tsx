import { type IconComponent } from "@aevryn/ui/lib/icon-context";
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
import { InputGroup, InputField } from "@aevryn/ui/components/ui/input-group";

import { useState } from "react";

export function NewGroupDialog({
  open,
  defaultOpen,
  onOpenChange,
  onConfirm,
  loading = false,
  icon,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm?: (name: string) => void;
  loading?: boolean;
  icon?: IconComponent;
}) {
  const [name, setName] = useState("");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm?.(trimmed);
  };

  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New Group</DialogTitle>
          <DialogDescription>Create a new group</DialogDescription>
        </DialogHeader>
        <InputGroup className="w-full">
          <InputField
            index={0}
            label=""
            value={name}
            onChange={setName}
            placeholder="Group name"
            icon={icon}
          />
        </InputGroup>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={!name.trim()}
            loading={loading}
            onClick={handleCreate}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
