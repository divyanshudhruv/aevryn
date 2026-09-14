import { monotonicFactory } from "ulid";

const factory = monotonicFactory();

export const ID_PREFIXES = {
	workspace: "wp_",
	group: "grp_",
	userProfile: "prf_",
	thread: "thd_",
	workflow: "wf_",
	planStep: "pls_",
	message: "msg_",
	step: "stp_",
	provider: "prv_",
	userKey: "key_",
	userSettings: "us_",
	callout: "cal_",
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
	userProfile: () => makeId(ID_PREFIXES.userProfile),
	thread: () => makeId(ID_PREFIXES.thread),
	workflow: () => makeId(ID_PREFIXES.workflow),
	planStep: () => makeId(ID_PREFIXES.planStep),
	message: () => makeId(ID_PREFIXES.message),
	step: () => makeId(ID_PREFIXES.step),
	provider: () => makeId(ID_PREFIXES.provider),
	userKey: () => makeId(ID_PREFIXES.userKey),
	userSettings: () => makeId(ID_PREFIXES.userSettings),
	callout: () => makeId(ID_PREFIXES.callout),
} as const;
