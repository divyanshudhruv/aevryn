import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToRealtime } from "./realtime-channel";

interface FakeChannel {
	name: string;
	state: string;
	on: ReturnType<typeof vi.fn>;
	subscribe: ReturnType<typeof vi.fn>;
}

function makeFakeSupabase(): {
	channels: FakeChannel[];
	removeChannel: ReturnType<typeof vi.fn>;
	supabase: never;
} {
	const channels: FakeChannel[] = [];
	const removeChannel = vi.fn();
	const supabase = {
		channel: (name: string): FakeChannel => {
			const ch: FakeChannel = {
				name,
				state: "SUBSCRIBED",
				on: vi.fn(function (this: FakeChannel) {
					return this;
				}),
				subscribe: vi.fn(() => undefined),
			};
			channels.push(ch);
			return ch;
		},
		removeChannel,
	};
	return { channels, removeChannel, supabase: supabase as never };
}

const cfg = {
	event: "*",
	schema: "public",
	table: "items",
} as const;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("subscribeToRealtime", () => {
	it("subscribes to postgres_changes and forwards events", () => {
		const { channels, supabase } = makeFakeSupabase();
		const onEvent = vi.fn();
		const onStatus = vi.fn();

		const unsubscribe = subscribeToRealtime({
			supabase,
			channelName: "ch_1",
			config: cfg,
			onEvent,
			onStatus,
		});

		const ch = channels[0]!;
		expect(ch.name).toBe("ch_1");
		expect(ch.on).toHaveBeenCalledWith(
			"postgres_changes",
			cfg,
			expect.any(Function),
		);
		expect(ch.subscribe).toHaveBeenCalledWith(expect.any(Function));

		const statusCb = ch.subscribe.mock.calls[0]?.[0];
		statusCb("SUBSCRIBED");
		expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");

		const eventCb = ch.on.mock.calls[0]?.[2];
		eventCb({ eventType: "INSERT", new: { id: 1 }, old: null });
		expect(onEvent).toHaveBeenCalledWith({
			eventType: "INSERT",
			new: { id: 1 },
			old: null,
		});

		unsubscribe();
	});

	it("reconnects with backoff on a retryable error and resets the retry counter on SUBSCRIBED", async () => {
		const { channels, removeChannel, supabase } = makeFakeSupabase();
		const onReconnected = vi.fn();

		subscribeToRealtime({
			supabase,
			channelName: "ch_2",
			config: cfg,
			onEvent: () => {},
			onReconnected,
			maxRetries: 2,
			baseDelayMs: 100,
			heartbeatMs: 10_000,
		});

		let ch = channels[0]!;
		let statusCb = ch.subscribe.mock.calls[0]?.[0];
		statusCb("SUBSCRIBE_ERROR");
		expect(removeChannel).toHaveBeenCalledTimes(1);
		expect(channels).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(100);
		expect(channels).toHaveLength(2);
		expect(removeChannel).toHaveBeenCalledTimes(1);

		ch = channels[1]!;
		statusCb = ch.subscribe.mock.calls[0]?.[0];
		statusCb("SUBSCRIBED");
		expect(onReconnected).toHaveBeenCalledTimes(1);

		statusCb("CHANNEL_ERROR");
		expect(removeChannel).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(100);
		expect(channels).toHaveLength(3);
	});

	it("gives up reconnecting after maxRetries", async () => {
		const { channels, removeChannel, supabase } = makeFakeSupabase();

		subscribeToRealtime({
			supabase,
			channelName: "ch_3",
			config: cfg,
			onEvent: () => {},
			maxRetries: 2,
			baseDelayMs: 100,
			heartbeatMs: 10_000,
		});

		const statusCb1 = channels[0]?.subscribe.mock.calls[0]?.[0];
		statusCb1("SUBSCRIBE_ERROR");
		expect(removeChannel).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(100);
		expect(channels).toHaveLength(2);

		const statusCb2 = channels[1]?.subscribe.mock.calls[0]?.[0];
		statusCb2("CHANNEL_ERROR");
		await vi.advanceTimersByTimeAsync(10_000);
		expect(channels).toHaveLength(2);
		expect(removeChannel).toHaveBeenCalledTimes(1);
	});

	it("heartbeat reconnects when the channel is errored or closed", async () => {
		const { channels, removeChannel, supabase } = makeFakeSupabase();
		const onReconnected = vi.fn();

		subscribeToRealtime({
			supabase,
			channelName: "ch_4",
			config: cfg,
			onEvent: () => {},
			onReconnected,
			baseDelayMs: 100,
			heartbeatMs: 50,
		});

		const ch = channels[0]!;
		ch.state = "errored";

		await vi.advanceTimersByTimeAsync(50);
		expect(removeChannel).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(100);
		expect(channels).toHaveLength(2);

		const statusCb = channels[1]?.subscribe.mock.calls[0]?.[0];
		statusCb("SUBSCRIBED");
		expect(onReconnected).toHaveBeenCalledTimes(1);
	});

	it("heartbeat ignores healthy channels and a pending reconnect timer", async () => {
		const { channels, removeChannel, supabase } = makeFakeSupabase();

		subscribeToRealtime({
			supabase,
			channelName: "ch_5",
			config: cfg,
			onEvent: () => {},
			baseDelayMs: 100,
			heartbeatMs: 50,
		});

		await vi.advanceTimersByTimeAsync(10_000);
		expect(channels).toHaveLength(1);
		expect(removeChannel).not.toHaveBeenCalled();

		const statusCb = channels[0]?.subscribe.mock.calls[0]?.[0];
		statusCb("SUBSCRIBE_ERROR");
		await vi.advanceTimersByTimeAsync(45);
		expect(channels).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(55);
		expect(channels).toHaveLength(2);
	});

	it("unsubscribe cancels pending reconnects and removes the active channel", async () => {
		const { channels, removeChannel, supabase } = makeFakeSupabase();

		const unsubscribe = subscribeToRealtime({
			supabase,
			channelName: "ch_6",
			config: cfg,
			onEvent: () => {},
			baseDelayMs: 100,
			heartbeatMs: 50,
		});

		const statusCb = channels[0]?.subscribe.mock.calls[0]?.[0];
		statusCb("SUBSCRIBE_ERROR");
		expect(removeChannel).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(45);

		unsubscribe();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(channels).toHaveLength(1);
		expect(removeChannel).toHaveBeenCalledTimes(1);
	});
});
