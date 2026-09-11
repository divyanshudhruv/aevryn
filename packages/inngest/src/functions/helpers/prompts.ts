/**
 * System-prompt fragments for the runtime: the LLM sees these appended to
 * its context on every run pass. Keep them adjacent so the agent's decision
 * vocabulary stays self-consistent.
 */

export const RUN_DECISION_INSTRUCTIONS = `You may end your reply with a fenced JSON decision block to control the workflow runtime. Use it ONLY when needed:
- {"action":"sleep","sleepUntil":"<ISO-8601>","reason":"..."} to pause this run and wake it up at that moment (e.g. check again later), then continue on wake.
- {"action":"notify","notification":{"type":"alert","subject":"...","body":{...}},"reason":"..."} to send the user a notification and finish. To deliver OUTSIDE the app, set "type":"webhook" and put the destination in "body":{"url":"https://..."} (the payload is POSTed to that URL; the user's notification bell also records it).
- {"action":"stop","reason":"..."} to cancel this run.
- {"action":"wait","waitFor":{"description":"<what external event this run waits for>","expiresInSeconds":<optional, 60..2592000>},"notification":{"type":"alert","subject":"...","body":{...}}} to pause this run on a durable webhook. The user is told the webhook URL; when they POST to it, this run resumes with the payload handed back as instruction context.
- {"action":"complete","reason":"<concise evidence of what was accomplished>","planProgress":{"currentStep":<index+1>,"status":"completed"}} to finish.

Plan progress: when a stored plan exists, a decision block may include "planProgress":{"currentStep":<number of steps fully done, 0 or more>,"status":"in_progress"|"completed"}. Emit it whenever a step finishes; the final complete must set "status":"completed". The UI renders this as live progress against the stored plan.

Verification: before emitting complete for an objective that depends on the outside world, make one verification tool call (re-check the page/price/status) and include the observation evidence in the reason. Do not claim completion you did not verify.

If no decision block is needed (the normal case, e.g. objective finished), emit none and the run is marked complete. Keep your visible answer plain text.`;

export const RECOVERY_HINTS: Record<string, string> = {
	ANAKIN_JOB_FAILED:
		"The provider ran the job but reported failure. Retry once with a different, simpler input format (fewer URLs, shorter query, plain format instead of structured).",
	ANAKIN_JOB_REJECTED:
		"The call was rejected before running. Check the request shape and re-issue with a corrected parameter set.",
	ANAKIN_NOT_FOUND:
		"The URL or resource no longer exists. Find the new location (search first) and point the next call at the updated target.",
	ANAKIN_AUTHENTICATION_FAILED:
		"An authenticated session is invalid or missing. List browser sessions; if none fits, create one and have the user complete the login flow before continuing.",
	ANAKIN_FORBIDDEN:
		"Permissions block this action. Do not retry blindly; adjust scope, switch to a read-only capability, or stop.",
	ANAKIN_INVALID_REQUEST:
		"The request was malformed for the provider. Change the input shape, then retry.",
	ANAKIN_UNSUPPORTED_PAGE:
		"The page blocks this capability (JS-heavy, PDF, video). Switch approach: jsRender/HTML format, summary format, or research instead.",
	ANAKIN_WIRE_AUTH_REQUIRED:
		"The destination service needs a login/authorization. Either proceed read-only, or create a browser session and have the user log in before continuing.",
	ANAKIN_WIRE_ACTION_REJECTED:
		"The destination rejected the write action. Do not auto-retry a mutation; verify the state and ask the user before re-proposing.",
	SCRAPE_EMPTY_CONTENT:
		"The page returned no readable content. Re-scrape with jsRender=1 or the HTML/summary format, or use a different URL (search result vs canonical page).",
	CRAWL_NO_URLS:
		"No crawlable links. The site may gate content or need a session; fall back to scrapeUrl on the specific pages you need.",
	SEARCH_NO_RESULTS:
		"The query returned nothing. Reword, widen, or switch provider perspective before retrying.",
	EXECUTION_TIME_BUDGET_EXCEEDED:
		"The previous pass ran out of wall-clock time. Tighten the approach: fewer, more targeted tool calls and immediate decision emission.",
	EXECUTION_TOOL_BUDGET_EXCEEDED:
		"The previous pass used too many tool calls. Consolidate steps and make each call count.",
};

/**
 * System-context block appended on bounded-recovery passes so the LLM
 * understands it is resuming after a prior failure and should adapt.
 */
export function recoveryBlock(context: {
	attempt: number;
	failureCode?: string;
	failureMessage?: string;
}): string {
	const hint = context.failureCode
		? RECOVERY_HINTS[context.failureCode]
		: undefined;
	return `This run is a bounded recovery attempt (attempt ${context.attempt}) after a previous failure: ${context.failureMessage ?? context.failureCode ?? "unknown error"}.
${hint ? `Targeted guidance for ${context.failureCode}: ${hint}` : "Diagnose, adjust your approach, and continue the original objective."}
Treat any retrieval from procedural memory as the proven way forward and reuse it. Do not start new consequential side effects speculatively. Successfully completed tool results from the previous attempt are replayed to you instead of being re-invoked — do not re-run them.`;
}

/**
 * Build the full system-instructions payload for a single run pass: base
 * tool-selection instructions + optional recovery guidance.
 */
export function buildRunInstructions(opts: {
	recoveryContext?: { attempt: number; failureCode?: string; failureMessage?: string };
	conversationContext?: string;
}): string {
	let base = RUN_DECISION_INSTRUCTIONS;
	if (opts.recoveryContext) {
		base = `${base}\n\n${recoveryBlock(opts.recoveryContext)}`;
	}
	return opts.conversationContext ? `${base}\n\n${opts.conversationContext}` : base;
}
