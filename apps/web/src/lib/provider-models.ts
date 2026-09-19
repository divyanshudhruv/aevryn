import type { ProviderModelOption } from "@/components/chat/workspace-header";

// Module-level provider/model cache. The header picker + model override are
// read on every mount (and each sidebar open), so short-lived re-fetches of
// the same user-level settings are pure churn. Bust 60s TTL; the settings
// dialog dispatches `aevryn:settings-changed` after mutating these tables,
// and callers invalidate via invalidateProviderModels().
const PROVIDERS_CACHE_TTL_MS = 60_000;

interface ProvidersSnapshot {
	at: number;
	options: ProviderModelOption[];
	defaultModel: { providerSlug: string; modelId: string } | null;
}

let providersCache: ProvidersSnapshot | null = null;

/** Drops the cached snapshot; the next read refetches. */
export function invalidateProviderModels(): void {
	providersCache = null;
}

/** Cached read of `/api/providers` + `/api/settings` (default model).
 *  `force` bypasses the TTL — used on settings changes. */
export async function fetchProviderModels(
	force = false,
): Promise<ProvidersSnapshot | null> {
	const cache = providersCache;
	if (!force && cache && Date.now() - cache.at < PROVIDERS_CACHE_TTL_MS) {
		return cache;
	}
	const [providersRes, settingsRes] = await Promise.all([
		fetch("/api/providers", { cache: "no-store" }),
		fetch("/api/settings", { cache: "no-store" }),
	]);
	if (!providersRes.ok) return cache ?? null;
	const json = (await providersRes.json()) as {
		data: Array<{
			slug: string;
			displayName: string;
			models: Array<{ id: string; displayName?: string }>;
		}>;
	};
	const options: ProviderModelOption[] = (json.data ?? []).flatMap((provider) =>
		(provider.models ?? []).map((model) => ({
			providerSlug: provider.slug,
			providerName: provider.displayName,
			modelId: model.id,
			modelName: model.displayName ?? model.id,
		})),
	);
	const settingsJson = (await settingsRes.json().catch(() => null)) as {
		data?: {
			defaultModel?: { providerSlug: string; modelId: string } | null;
		};
	} | null;
	const defaultModel = settingsJson?.data?.defaultModel ?? null;
	providersCache = { at: Date.now(), options, defaultModel };
	return providersCache;
}
