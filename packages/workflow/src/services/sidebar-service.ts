import type { Callout, Db } from "@aevryn/db";
import { callouts, db } from "@aevryn/db";
import { asc, eq } from "drizzle-orm";

/**
 * Global sidebar callout/promo cards. Callouts are not scoped to any
 * workspace or user — they're globally visible when visible=true.
 */
export class SidebarService {
	constructor(private readonly client: Db = db) {}

	async listPromoCards(): Promise<Callout[]> {
		return this.client
			.select()
			.from(callouts)
			.where(eq(callouts.visible, true))
			.orderBy(asc(callouts.order));
	}
}

export const sidebarService = new SidebarService();
