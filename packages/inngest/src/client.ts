import { env } from "@aevryn/env/server";
import { Inngest } from "inngest";

export const inngest = new Inngest({
	id: "aevryn",
	eventKey: env.INNGEST_EVENT_KEY,
	signingKey: env.INNGEST_SIGNING_KEY,
});
