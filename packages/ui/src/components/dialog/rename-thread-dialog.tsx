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

export function RenameThreadDialog({
	open,
	defaultOpen,
	onOpenChange,
	title,
	onRename,
	loading = false,
	icon,
}: {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	title?: string;
	onRename?: (newTitle: string) => void;
	loading?: boolean;
	icon?: IconComponent;
}) {
	const [value, setValue] = useState(title ?? "");

	const trimmed = value.trim();
	const disabled = trimmed === "";

	const handleRename = () => {
		onRename?.(trimmed);
	};

	return (
		<Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
			<DialogContent size="sm">
				<DialogHeader>
					<DialogTitle>Rename thread</DialogTitle>
					<DialogDescription>Give this thread a new name.</DialogDescription>
				</DialogHeader>
				<InputGroup className="w-full">
					<InputField
						index={0}
						label=""
						value={value}
						onChange={setValue}
						placeholder="Thread name"
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
