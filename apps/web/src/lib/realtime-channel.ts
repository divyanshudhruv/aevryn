"use client";

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

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
  maxRetries = 3,
  baseDelayMs = 1000,
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
  maxRetries?: number;
  baseDelayMs?: number;
}): () => void {
  let cancelled = false;
  let attempts = 0;
  let current: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const teardown = () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
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
    channel.subscribe((status) => {
      onStatus?.(status);
      if (!RETRYABLE_STATUSES.has(status)) return;
      if (attempts >= maxRetries || cancelled) return;
      void supabase.removeChannel(channel);
      current = null;
      const delay = baseDelayMs * 2 ** (attempts - 1);
      timer = setTimeout(connect, delay);
    });
  };

  connect();
  return teardown;
}