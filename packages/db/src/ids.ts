import { monotonicFactory } from "ulid";

const factory = monotonicFactory();

export const ID_PREFIXES = {
	workspace: "wp_",
	group: "grp_",
	workspaceMember: "wme_",
	userProfile: "prf_",
	thread: "thd_",
	workflow: "wf_",
	plan: "pln_",
	planStep: "pls_",
	chatMessage: "msg_",
	run: "run_",
	runActivity: "act_",
	approvalRequest: "apv_",
	invite: "inv_",
	threadShare: "tco_",
	notification: "not_",
	workspaceApiKey: "key_",
	file: "fil_",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

export function makeId(prefix: IdPrefix): string {
	return `${prefix}${factory()}`;
}

export function isValidId(prefix: IdPrefix, id: string): boolean {
	if (!id.startsWith(prefix)) return false;
	return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id.slice(prefix.length));
}

export const ids = {
	workspace: () => makeId(ID_PREFIXES.workspace),
	group: () => makeId(ID_PREFIXES.group),
	workspaceMember: () => makeId(ID_PREFIXES.workspaceMember),
	userProfile: () => makeId(ID_PREFIXES.userProfile),
	thread: () => makeId(ID_PREFIXES.thread),
	workflow: () => makeId(ID_PREFIXES.workflow),
	plan: () => makeId(ID_PREFIXES.plan),
	planStep: () => makeId(ID_PREFIXES.planStep),
	chatMessage: () => makeId(ID_PREFIXES.chatMessage),
	run: () => makeId(ID_PREFIXES.run),
	runActivity: () => makeId(ID_PREFIXES.runActivity),
	approvalRequest: () => makeId(ID_PREFIXES.approvalRequest),
	invite: () => makeId(ID_PREFIXES.invite),
	threadShare: () => makeId(ID_PREFIXES.threadShare),
	notification: () => makeId(ID_PREFIXES.notification),
	workspaceApiKey: () => makeId(ID_PREFIXES.workspaceApiKey),
	file: () => makeId(ID_PREFIXES.file),
} as const;