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

import { type IconComponent } from "@aevryn/ui/lib/icon-context";
import { useState } from "react";
import { getBrowserSupabase } from "@aevryn/auth";

export function NewThreadDialog({
  open,
  defaultOpen,
  onOpenChange,
  workspaceId,
  groupId,
  onCreateSuccess,
  icon,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  workspaceId: string;
  groupId: string;
  onCreateSuccess?: () => void;
  icon?: IconComponent;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("threads")
        .insert({
          workspace_id: workspaceId,
          group_id: groupId,
          user_id: user.id,
          title: name.trim(),
        });
      if (error) throw error;
      setName("");
      onCreateSuccess?.();
      onOpenChange?.(false);
    } catch {
      // keep dialog open so user can retry
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New Thread</DialogTitle>
          <DialogDescription>Create a new thread</DialogDescription>
        </DialogHeader>
        <InputGroup className="w-full">
          <InputField
            index={0}
            label=""
            value={name}
            onChange={setName}
            placeholder="Research"
            icon={icon}
          />
        </InputGroup>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button disabled={!name.trim()} loading={creating} onClick={handleCreate}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
