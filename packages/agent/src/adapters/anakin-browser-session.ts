import { Anakin } from "@anakin-io/sdk";

import type {
	BrowserSession,
	BrowserSessionAdapter,
	BrowserSessionHandle,
} from "./browser-session";

export class AnakinBrowserSessionAdapter implements BrowserSessionAdapter {
	readonly name = "anakin-browser-sessions";
	private readonly client: Anakin;

	constructor(client?: Anakin) {
		this.client =
			client ??
			new Anakin({
				apiKey: process.env.ANAKIN_API_KEY,
				baseUrl: process.env.ANAKIN_BASE_URL,
			});
	}

	async list(options?: { domain?: string }): Promise<BrowserSession[]> {
		const sessions = await this.client.sessions.list({
			domain: options?.domain,
		});
		return sessions.map((session) => ({
			id: session.id,
			name: session.name,
			websiteUrl: session.websiteUrl,
			websiteDomain: session.websiteDomain,
			isActive: session.isActive,
			createdAt: session.createdAt,
			lastUsedAt: session.lastUsedAt,
			expiresAt: session.expiresAt,
		}));
	}

	async create(options: {
		websiteUrl: string;
		name: string;
		record?: boolean;
	}): Promise<BrowserSessionHandle> {
		const handle = await this.client.sessions.create({
			websiteUrl: options.websiteUrl,
			name: options.name,
			record: options.record,
		});
		return {
			sessionId: handle.sessionId,
			novncUrl: handle.novncUrl,
			accessToken: handle.accessToken,
			expiresIn: handle.expiresIn,
		};
	}

	async delete(sessionId: string): Promise<void> {
		await this.client.sessions.delete(sessionId);
	}
}
