import { describe, expect, it } from "vitest";

import {
	MESSAGE_ROLES,
	PLAN_LEVELS,
	RUN_STATUSES,
	STEP_TOOL_STATUSES,
} from "../src/domain";
import {
	messages,
	planSteps,
	steps,
	userKeys,
	userProviders,
	userSettings,
	workflows,
} from "../src/schema";

describe("new schema tables", () => {
	it("exposes all seven tables", () => {
		[messages, steps, workflows, planSteps, userProviders, userKeys, userSettings].forEach(
			(table) => expect(table).toBeTruthy(),
		);
	});

	it("keeps messages on the small role vocabulary", () => {
		expect(MESSAGE_ROLES).toEqual(["user", "assistant", "system"]);
	});

	it("keeps the step tool status vocabulary at three values", () => {
		expect(STEP_TOOL_STATUSES).toEqual(["running", "completed", "failed"]);
	});

	it("does not regress the confirmed run statuses", () => {
		expect(RUN_STATUSES).toEqual([
			"running",
			"awaiting_approval",
			"completed",
			"failed",
			"sleeping",
			"idle",
		]);
		expect(PLAN_LEVELS).toEqual(["free", "pro"]);
	});

	it("types steps.toolCalls as StepToolCall[]", () => {
		const columns = steps.toolCalls;
		expect(columns.dataType).toBe("json");
	});
});
