export interface BrowserSession {
	id: string;
	name?: string;
	websiteUrl?: string;
	websiteDomain?: string;
	isActive: boolean;
	createdAt?: string;
	lastUsedAt?: string;
	expiresAt?: string;
}

export interface BrowserSessionHandle {
	sessionId: string;
	novncUrl?: string;
	accessToken?: string;
	expiresIn?: number;
}

export interface BrowserSessionAdapter {
	readonly name: string;
	list(options?: { domain?: string }): Promise<BrowserSession[]>;
	create(options: {
		websiteUrl: string;
		name: string;
		record?: boolean;
	}): Promise<BrowserSessionHandle>;
	delete(sessionId: string): Promise<void>;
}
