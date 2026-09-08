import { Anakin } from "@anakin-io/sdk";

import type { WireAdapter, WireResult } from "./wire";

export class AnakinWireAdapter implements WireAdapter {
	readonly name = "anakin-wire";
	private readonly client: Anakin;

	constructor(client?: Anakin) {
		this.client =
			client ??
			new Anakin({
				apiKey: process.env.ANAKIN_API_KEY,
				baseUrl: process.env.ANAKIN_BASE_URL,
			});
	}

	async wire(
		actionId: string,
		params: Record<string, unknown>,
	): Promise<WireResult> {
		const result = await this.client.wire(actionId, params);
		return {
			jobId: result.jobId,
			status: result.status,
			data: result.data,
			creditsUsed: result.creditsUsed,
			executionMs: result.executionMs,
			error: result.error,
		};
	}
}
