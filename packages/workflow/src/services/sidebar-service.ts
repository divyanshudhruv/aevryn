import type { Callout, Db } from "@aevryn/db";
import { callouts, db, ids } from "@aevryn/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";

/**
 * Sidebar data helpers — server-driven promo/callout cards rendered in the
 * sidebar footer callout area. Cards are scoped to a workspace, a user, or
 * both; null scoping = visible to everyone.
 */
export class SidebarService {
	constructor(private readonly client: Db = db) {}

	async listPromoCards(input: {
		workspaceId?: string;
		userId?: string;
	}): Promise<Callout[]> {
		const conditions = [eq(callouts.visible, true)];
		if (input.workspaceId) {
			conditions.push(
				or(
					eq(callouts.workspaceId, input.workspaceId),
					isNull(callouts.workspaceId),
				)!,
			);
		}
		if (input.userId) {
			conditions.push(
				or(eq(callouts.userId, input.userId), isNull(callouts.userId))!,
			);
		}
		return this.client.query.callouts.findMany({
			where: and(...conditions),
			orderBy: [asc(callouts.order)],
		});
	}

	async upsertPromoCard(input: {
		id?: string;
		workspaceId?: string | null;
		userId?: string | null;
		title: string;
		description?: string;
		imageUrl?: string | null;
		order?: number;
		visible?: boolean;
	}): Promise<Callout> {
		const values = {
			id: input.id ?? ids.callout(),
			workspaceId: input.workspaceId ?? null,
			userId: input.userId ?? null,
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
