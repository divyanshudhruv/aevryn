import type { ProviderModelOption } from "@/components/chat/workspace-header";

const PROVIDERS_CACHE_TTL_MS = 60_000;

interface ProvidersSnapshot {
	at: number;
	options: ProviderModelOption[];
	defaultModel: { providerSlug: string; modelId: string } | null;
}

let providersCache: ProvidersSnapshot | null = null;

export function invalidateProviderModels(): void {
	providersCache = null;
}

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
