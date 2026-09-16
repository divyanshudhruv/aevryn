"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** Failure statuses worth reconnecting over — supabase-js emits these when
 *  the channel can't subscribe (auth/network/limits). */
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

/**
 * Subscribe to a postgres_changes channel with automatic reconnection.
 *
 * On a failure status the channel is removed and re-created with exponential
 * backoff (1s, 2s, 4s — max `maxRetries` attempts). Same channel name on the
 * same client shares one websocket, so parallel subscribers don't multiply
 * the connection count.
 *
 * Returns an unsubscribe function; call it in the effect cleanup.
 */
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
	/** Fired once after the channel successfully re-subscribes following a
	 *  detected drop (subscribe callback or heartbeat). Consumers use it to
	 *  re-query any state that may have gone stale while disconnected. */
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
				// CLOSED etc. is expected on unsubscribe (page navigation) and on
				// the heartbeat's forced resubscribe — debug, not error.
				console.debug(`[realtime ${channelName}]`, status, err ?? "");
			}
			onStatus?.(status);
			if (status === "SUBSCRIBED") {
				// Healthy again: reset the budget so a long-lived session never
				// exhausts it permanently, and let consumers re-sync if we ever left.
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

	// Heartbeat: supabase-js can strand a channel in "errored"/"closed" without
	// ever surfacing a retryable subscribe callback (WS killed by a proxy,
	// network blip mid-longpoll). Poll channel.state and force a re-subscribe
	// so a silent drop isn't missed until the next change event.
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
