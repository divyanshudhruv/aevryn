"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

const RETRYABLE_STATUSES = new Set([
	"CHANNEL_ERROR",
	"SUBSCRIBE_ERROR",
	"TIMED_OUT",
]);

interface RealtimeChangesConfig {
	event: "*" | "INSERT" | "UPDATE" | "DELETE";
	schema: string;
	table: string;
	filter?: string;
}

export function subscribeToRealtime({
	supabase,
	channelName,
	config,
	onEvent,
	onStatus,
	onReconnected,
	maxRetries = 3,
	baseDelayMs = 1000,
	heartbeatMs = 15_000,
}: {
	supabase: SupabaseClient;
	channelName: string;
	config: RealtimeChangesConfig;
	onEvent: (payload: {
		eventType?: string;
		new?: Record<string, unknown>;
		old?: Record<string, unknown>;
	}) => void;
	onStatus?: (status: string) => void;
	onReconnected?: () => void;
	maxRetries?: number;
	baseDelayMs?: number;
	heartbeatMs?: number;
}): () => void {
	let cancelled = false;
	let attempts = 0;
	let dropped = false;
	let current: RealtimeChannel | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	const teardown = () => {
		cancelled = true;
		if (timer) clearTimeout(timer);
		if (heartbeat) clearInterval(heartbeat);
		if (current) void supabase.removeChannel(current);
	};

	const connect = () => {
		if (cancelled) return;
		const channel = supabase
			.channel(channelName)
			.on("postgres_changes", config, (payload) => {
				onEvent({
					eventType: payload.eventType,
					new: payload.new as Record<string, unknown> | undefined,
					old: payload.old as Record<string, unknown> | undefined,
				});
			});

		current = channel;
		attempts += 1;
		channel.subscribe((status, err) => {
			if (RETRYABLE_STATUSES.has(status)) {
				console.error(`[realtime ${channelName}]`, status, err ?? "");
			} else if (status !== "SUBSCRIBED") {
				console.debug(`[realtime ${channelName}]`, status, err ?? "");
			}
			onStatus?.(status);
			if (status === "SUBSCRIBED") {
				attempts = 0;
				if (dropped) {
					dropped = false;
					onReconnected?.();
				}
				return;
			}
			if (!RETRYABLE_STATUSES.has(status)) return;
			dropped = true;
			if (attempts >= maxRetries || cancelled) return;
			void supabase.removeChannel(channel);
			current = null;
			const delay = baseDelayMs * 2 ** (attempts - 1);
			timer = setTimeout(connect, delay);
		});
	};

	heartbeat = setInterval(() => {
		if (cancelled || timer) return;
		const state = current?.state;
		if (!current || (state !== "errored" && state !== "closed")) return;
		dropped = true;
		if (attempts >= maxRetries) return;
		void supabase.removeChannel(current);
		current = null;
		const delay = baseDelayMs * 2 ** Math.max(0, attempts - 1);
		timer = setTimeout(connect, delay);
	}, heartbeatMs);

	connect();
	return teardown;
}
