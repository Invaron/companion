import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OrchestratorRuntime } from "./orchestrator.js";
import { RuntimeStore } from "./store.js";

describe("OrchestratorRuntime - Error Handling", () => {
  const userId = "test-user";
  let store: RuntimeStore;
  let orchestrator: OrchestratorRuntime;

  beforeEach(() => {
    store = new RuntimeStore(":memory:");
    orchestrator = new OrchestratorRuntime(store, userId);
    vi.useFakeTimers();
  });

  afterEach(() => {
    orchestrator.stop();
    vi.useRealTimers();
  });

  describe("resilience", () => {
    it("should start and keep running with no scheduled notifications", async () => {
      orchestrator.start();

      await vi.advanceTimersByTimeAsync(100);

      const snapshot = store.getSnapshot(userId);
      expect(snapshot).toBeDefined();
      expect(snapshot.notifications).toBeDefined();
    });

    it("should process due scheduled notifications", async () => {
      // Schedule a high-priority notification that's already due (bypasses digest batching)
      store.scheduleNotification(userId, {
        source: "orchestrator",
        title: "Test reminder",
        message: "This is a test",
        priority: "high"
      }, new Date(Date.now() - 1000));

      orchestrator.start();

      await vi.advanceTimersByTimeAsync(100);

      const snapshot = store.getSnapshot(userId);
      const testNotifs = snapshot.notifications.filter(n => n.title === "Test reminder");
      expect(testNotifs.length).toBe(1);
    });
  });
});
