import { Anakin } from "@anakin-io/sdk";

import type {
	BrowserSession,
	BrowserSessionAdapter,
	BrowserSessionCreateOptions,
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
			cookieCount: session.cookieCount,
			storageItemCount: session.storageItemCount,
		}));
	}

	async create(
		options: BrowserSessionCreateOptions,
	): Promise<BrowserSessionHandle> {
		const handle = await this.client.sessions.create({
			websiteUrl: options.websiteUrl,
			name: options.name,
			record: options.record,
			sessionType: options.sessionType,
		});
		return {
			sessionId: handle.sessionId,
			novncUrl: handle.novncUrl,
			accessToken: handle.accessToken,
			expiresIn: handle.expiresIn,
			wsUrl: handle.wsUrl,
		};
	}

	async update(
		sessionId: string,
		params: { name: string },
	): Promise<BrowserSession> {
		const session = await this.client.sessions.update(sessionId, params);
		return {
			id: session.id,
			name: session.name,
			websiteUrl: session.websiteUrl,
			websiteDomain: session.websiteDomain,
			isActive: session.isActive,
			createdAt: session.createdAt,
			lastUsedAt: session.lastUsedAt,
			expiresAt: session.expiresAt,
			cookieCount: session.cookieCount,
			storageItemCount: session.storageItemCount,
		};
	}

	async delete(sessionId: string): Promise<void> {
		await this.client.sessions.delete(sessionId);
	}
}
