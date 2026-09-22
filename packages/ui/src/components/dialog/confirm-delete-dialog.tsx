"use client";

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
import { InputCopy } from "../../components/ui/input-copy";

export interface ConfirmDeleteDialogProps {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	title: string;
	description: string;
	actionLabel: string;
	items: Array<{ value: string }>;
	onConfirm?: () => void;
	loading?: boolean;
}

export function ConfirmDeleteDialog({
	open,
	defaultOpen,
	onOpenChange,
	title,
	description,
	actionLabel,
	items = [],
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
					{items.map((item, index) => (
						<InputCopy
							key={`${index}-${item.value}`}
							value={item.value}
							className="truncate"
							disabled
						/>
					))}
				</div>

				<DialogFooter>
					<DialogClose render={<Button variant="ghost">Cancel</Button>} />
					<Button loading={loading} onClick={onConfirm} disabled={loading}>
						{actionLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
