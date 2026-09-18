import { InputField, InputGroup } from "@aevryn/ui/components/ui/input-group";
import type { IconComponent } from "@aevryn/ui/lib/icon-context";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/dialog";

export function RenameGroupDialog({
	open,
	defaultOpen,
	onOpenChange,
	name,
	onRename,
	loading = false,
	icon,
}: {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	name?: string;
	onRename?: (newName: string) => void;
	loading?: boolean;
	icon?: IconComponent;
}) {
	const [value, setValue] = useState(name ?? "");

	const trimmed = value.trim();
	const disabled = trimmed === "";

	const handleRename = () => {
		onRename?.(trimmed);
	};

	return (
		<Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Rename group</DialogTitle>
					<DialogDescription>Give this group a new name.</DialogDescription>
				</DialogHeader>
				<InputGroup className="w-full">
					<InputField
						index={0}
						label=""
						value={value}
						onChange={setValue}
						placeholder="Group name"
						icon={icon}
					/>
				</InputGroup>

				<DialogFooter>
					<DialogClose render={<Button variant="ghost">Cancel</Button>} />
					<Button disabled={disabled} loading={loading} onClick={handleRename}>
						Rename
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
