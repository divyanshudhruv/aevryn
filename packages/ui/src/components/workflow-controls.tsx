import { Button } from "./ui/button";

export type WorkflowControlsStatus =
	| "draft"
	| "active"
	| "paused"
	| "sleeping"
	| "waiting"
	| "awaiting_approval"
	| "pending"
	| "running"
	| "completed"
	| "cancelled"
	| "failed";

export interface WorkflowControlsProps {
	status?: WorkflowControlsStatus | null;
	runBusy?: boolean;
	stopBusy?: boolean;
	pauseBusy?: boolean;
	resumeBusy?: boolean;
	deleteBusy?: boolean;
	onRun?: () => void;
	onStop?: () => void;
	onPause?: () => void;
	onResume?: () => void;
	onDelete?: () => void;
}

const live = (status?: WorkflowControlsStatus | null) =>
	status != null &&
	["pending", "running", "awaiting_approval", "sleeping", "waiting"].includes(
		status,
	);

const terminal = (status?: WorkflowControlsStatus | null) =>
	status != null &&
	["completed", "cancelled", "failed"].includes(status);

const anyBusy = (props: WorkflowControlsProps) =>
	props.runBusy ||
	props.stopBusy ||
	props.pauseBusy ||
	props.resumeBusy ||
	props.deleteBusy;

export function WorkflowControls(props: WorkflowControlsProps) {
	return (
		<div className="flex flex-row items-center gap-2">
			{props.status === "paused" ? (
				<Button
					variant="secondary"
					size="sm"
					loading={props.resumeBusy}
					disabled={anyBusy(props)}
					onClick={props.onResume}
				>
					Resume
				</Button>
			) : live(props.status) ? (
				<>
					<Button
						variant="secondary"
						size="sm"
						loading={props.pauseBusy}
						disabled={anyBusy(props)}
						onClick={props.onPause}
					>
						Pause
					</Button>
					<Button
						variant="ghost"
						size="sm"
						loading={props.stopBusy}
						disabled={anyBusy(props)}
						onClick={props.onStop}
					>
						Stop
					</Button>
				</>
			) : terminal(props.status) ? (
				<Button
					variant="secondary"
					size="sm"
					loading={props.runBusy}
					disabled={anyBusy(props)}
					onClick={props.onRun}
				>
					Run again
				</Button>
			) : null}
			<Button
				variant="ghost"
				size="sm"
				loading={props.deleteBusy}
				disabled={anyBusy(props)}
				onClick={props.onDelete}
				className="text-destructive hover:text-destructive"
			>
				Delete
			</Button>
		</div>
	);
}