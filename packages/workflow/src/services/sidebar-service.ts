import type { Callout, Db } from "@aevryn/db";
import { callouts, db, ids } from "@aevryn/db";
import { asc, eq } from "drizzle-orm";

/**
 * Global sidebar callout/promo cards. Callouts are not scoped to any
 * workspace or user — they're globally visible when visible=true.
 */
export class SidebarService {
	constructor(private readonly client: Db = db) {}

	async listPromoCards(): Promise<Callout[]> {
		return this.client.query.callouts.findMany({
			where: eq(callouts.visible, true),
			orderBy: [asc(callouts.order)],
		});
	}

	async upsertPromoCard(input: {
		id?: string;
		title: string;
		description?: string;
		imageUrl?: string | null;
		order?: number;
		visible?: boolean;
	}): Promise<Callout> {
		const values = {
			id: input.id ?? ids.callout(),
			title: input.title,
			description: input.description ?? "",
			imageUrl: input.imageUrl ?? null,
			order: input.order ?? 0,
			visible: input.visible ?? true,
		};

		const [row] = await this.client
			.insert(callouts)
			.values(values)
			.onConflictDoUpdate({
				target: callouts.id,
				set: {
					title: values.title,
					description: values.description,
					imageUrl: values.imageUrl,
					order: values.order,
					visible: values.visible,
					updatedAt: new Date(),
				},
			})
			.returning();

		return row!;
	}

	async deletePromoCard(id: string): Promise<void> {
		await this.client.delete(callouts).where(eq(callouts.id, id));
	}
}

export const sidebarService = new SidebarService();
