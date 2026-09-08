import { monotonicFactory } from "ulid";

const factory = monotonicFactory();

export const ID_PREFIXES = {
	workflow: "wf_",
	execution: "exe_",
	step: "step_",
	tool: "tool_",
	observation: "obs_",
	recovery: "rec_",
	memory: "mem_",
	event: "evt_",
	agentState: "agent_state_",
	schedule: "sched_",
	notification: "ntf_",
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
	workflow: () => makeId(ID_PREFIXES.workflow),
	execution: () => makeId(ID_PREFIXES.execution),
	step: () => makeId(ID_PREFIXES.step),
	tool: () => makeId(ID_PREFIXES.tool),
	observation: () => makeId(ID_PREFIXES.observation),
	recovery: () => makeId(ID_PREFIXES.recovery),
	memory: () => makeId(ID_PREFIXES.memory),
	event: () => makeId(ID_PREFIXES.event),
	agentState: () => makeId(ID_PREFIXES.agentState),
	schedule: () => makeId(ID_PREFIXES.schedule),
	notification: () => makeId(ID_PREFIXES.notification),
} as const;
