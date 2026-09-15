import { requireUser } from "@aevryn/auth";
import {
	db,
	DEFAULT_USER_SETTINGS,
	userSettings,
	type UserSettingsData,
} from "@aevryn/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

const settingsInputSchema = z.object({
	notifications: z
		.object({
			runFailed: z.boolean(),
			runCompleted: z.boolean(),
			runApproval: z.boolean(),
		})
		.partial()
		.optional(),
	defaultModel: z
		.object({
			providerSlug: z.string().min(1),
			modelId: z.string().min(1),
		})
		.nullable()
		.optional(),
	memoryEnabled: z.boolean().nullable().optional(),
});

async function loadSettings(userId: string): Promise<UserSettingsData> {
	const [row] = await db
		.select({ settings: userSettings.settings })
		.from(userSettings)
		.where(eq(userSettings.userId, userId));
	return row?.settings ?? DEFAULT_USER_SETTINGS;
}

export async function GET(): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const data = await loadSettings(user.id);
	return Response.json(
		{ data, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function PUT(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	let body: z.infer<typeof settingsInputSchema>;
	try {
		body = settingsInputSchema.parse(await request.json());
	} catch (err) {
		return jsonError(400, "BAD_REQUEST", `Invalid settings: ${err instanceof Error ? err.message : String(err)}`);
	}

	const current = await loadSettings(user.id);
	const merged: UserSettingsData = {
		notifications: { ...current.notifications, ...(body.notifications ?? {}) },
		defaultModel:
			body.defaultModel !== undefined
				? body.defaultModel
				: current.defaultModel,
		memoryEnabled:
			body.memoryEnabled !== undefined
				? body.memoryEnabled
				: (current.memoryEnabled ?? null),
	};

	await db
		.insert(userSettings)
		.values({ userId: user.id, settings: merged })
		.onConflictDoUpdate({
			target: userSettings.userId,
			set: { settings: merged, updatedAt: new Date() },
		});

	return Response.json(
		{ data: merged, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
