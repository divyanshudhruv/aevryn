export interface BrowserSession {
	id: string;
	name?: string;
	websiteUrl?: string;
	websiteDomain?: string;
	isActive: boolean;
	createdAt?: string;
	lastUsedAt?: string;
	expiresAt?: string;
	cookieCount?: number;
	storageItemCount?: number;
}

export interface BrowserSessionHandle {
	sessionId: string;
	novncUrl?: string;
	accessToken?: string;
	expiresIn?: number;
	wsUrl?: string;
}

export interface BrowserSessionCreateOptions {
	websiteUrl: string;
	name: string;
	record?: boolean;
	sessionType?: string;
}

export interface BrowserSessionAdapter {
	readonly name: string;
	list(options?: { domain?: string }): Promise<BrowserSession[]>;
	create(options: BrowserSessionCreateOptions): Promise<BrowserSessionHandle>;
	update(sessionId: string, params: { name: string }): Promise<BrowserSession>;
	delete(sessionId: string): Promise<void>;
}
