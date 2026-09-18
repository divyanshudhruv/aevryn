import { describe, expect, it, vi } from "vitest";

import { getCurrentUser, requireUser } from "../src/user";

function mockSupabase(userData: Record<string, unknown> | null) {
	return {
		auth: {
			getUser: vi.fn().mockResolvedValue({
				data: { user: userData ? { ...userData } : null },
				error: null,
			}),
		},
	} as never;
}

describe("getCurrentUser", () => {
	it("returns null when no session", async () => {
		expect(await getCurrentUser(mockSupabase(null))).toBeNull();
	});

	it("maps user id + metadata", async () => {
		const user = await getCurrentUser(
			mockSupabase({
				id: "user-1",
				email: "a@b.co",
				user_metadata: { full_name: "Ada", avatar_url: "https://x/y.png" },
			}),
		);
		expect(user).toEqual({
			id: "user-1",
			email: "a@b.co",
			name: "Ada",
			avatarUrl: "https://x/y.png",
		});
	});

	it("falls back to null for missing metadata", async () => {
		const user = await getCurrentUser(mockSupabase({ id: "user-2" }));
		expect(user).toEqual({
			id: "user-2",
			email: undefined,
			name: null,
			avatarUrl: null,
		});
	});
});

describe("requireUser", () => {
	it("throws when unauthenticated", async () => {
		await expect(requireUser(mockSupabase(null))).rejects.toThrow(
			"Unauthenticated",
		);
	});

	it("returns user when authenticated", async () => {
		await expect(
			requireUser(mockSupabase({ id: "user-3" })),
		).resolves.toMatchObject({ id: "user-3" });
	});

	it("rejects when the session check itself fails (expired/revoked session)", async () => {
		const supabase = {
			auth: {
				getUser: vi.fn().mockRejectedValue(new Error("Auth session expired")),
			},
		} as never;
		await expect(requireUser(supabase)).rejects.toThrow("Auth session expired");
	});
});