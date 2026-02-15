import { describe, expect, it, vi } from "vitest";
import { sendPushNotification } from "./push.js";
import { PushSubscriptionRecord } from "./types.js";

const subscription: PushSubscriptionRecord = {
  endpoint: "https://push.example/sub-1",
  expirationTime: null,
  keys: {
    p256dh: "k1",
    auth: "k2"
  }
};

const notification = {
  title: "Title",
  message: "Message",
  priority: "high" as const,
  source: "orchestrator" as const,
  timestamp: "2026-02-15T02:00:00.000Z"
};

describe("sendPushNotification retry logic", () => {
  it("retries transient failures and eventually delivers", async () => {
    const send = vi
      .fn<(subscription: PushSubscriptionRecord, payload: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn<(_: number) => Promise<void>>().mockResolvedValue(undefined);

    const result = await sendPushNotification(subscription, notification, {
      maxRetries: 2,
      baseDelayMs: 10,
      send,
      sleep
    });

    expect(result.delivered).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.retries).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry when subscription is gone", async () => {
    const send = vi.fn<(subscription: PushSubscriptionRecord, payload: string) => Promise<void>>().mockRejectedValue({
      statusCode: 410,
      message: "gone"
    });

    const result = await sendPushNotification(subscription, notification, {
      maxRetries: 2,
      send,
      sleep: vi.fn().mockResolvedValue(undefined)
    });

    expect(result.delivered).toBe(false);
    expect(result.shouldDropSubscription).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.retries).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
