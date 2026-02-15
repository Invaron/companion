import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerBackgroundSync, setupSyncListeners, triggerManualSync } from "./sync";
import * as api from "./api";

// Mock the API module
vi.mock("./api", () => ({
  processSyncQueue: vi.fn()
}));

describe("Background Sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerBackgroundSync", () => {
    it("should register sync when service worker and sync API are available", async () => {
      const mockRegister = vi.fn().mockResolvedValue(undefined);
      const mockRegistration = {
        sync: {
          register: mockRegister
        }
      };

      Object.defineProperty(global.navigator, "serviceWorker", {
        writable: true,
        configurable: true,
        value: {
          ready: Promise.resolve(mockRegistration)
        }
      });

      Object.defineProperty(global.ServiceWorkerRegistration, "prototype", {
        writable: true,
        configurable: true,
        value: {
          sync: {}
        }
      });

      await registerBackgroundSync();

      expect(mockRegister).toHaveBeenCalledWith("sync-operations");
    });

    it("should not throw if service worker is not available", async () => {
      Object.defineProperty(global.navigator, "serviceWorker", {
        writable: true,
        configurable: true,
        value: undefined
      });

      await expect(registerBackgroundSync()).resolves.not.toThrow();
    });

    it("should handle registration errors gracefully", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockRegister = vi.fn().mockRejectedValue(new Error("Registration failed"));
      const mockRegistration = {
        sync: {
          register: mockRegister
        }
      };

      Object.defineProperty(global.navigator, "serviceWorker", {
        writable: true,
        configurable: true,
        value: {
          ready: Promise.resolve(mockRegistration)
        }
      });

      await registerBackgroundSync();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Background sync registration failed:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("triggerManualSync", () => {
    it("should call processSyncQueue and return result", async () => {
      const mockResult = { processed: 5, failed: 2 };
      vi.mocked(api.processSyncQueue).mockResolvedValue(mockResult);

      const result = await triggerManualSync();

      expect(api.processSyncQueue).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  describe("setupSyncListeners", () => {
    it("should set up online event listener", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");

      setupSyncListeners();

      expect(addEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    });

    it("should set up visibilitychange event listener", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");

      setupSyncListeners();

      expect(addEventListenerSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    });

    it("should trigger sync when coming back online", () => {
      vi.mocked(api.processSyncQueue).mockResolvedValue({ processed: 0, failed: 0 });

      setupSyncListeners();

      // Simulate coming back online
      const onlineEvent = new Event("online");
      window.dispatchEvent(onlineEvent);

      expect(api.processSyncQueue).toHaveBeenCalled();
    });

    it("should trigger sync when page becomes visible and online", () => {
      vi.mocked(api.processSyncQueue).mockResolvedValue({ processed: 0, failed: 0 });

      Object.defineProperty(document, "hidden", {
        writable: true,
        configurable: true,
        value: false
      });

      Object.defineProperty(navigator, "onLine", {
        writable: true,
        configurable: true,
        value: true
      });

      setupSyncListeners();

      // Simulate visibility change
      const visibilityEvent = new Event("visibilitychange");
      document.dispatchEvent(visibilityEvent);

      expect(api.processSyncQueue).toHaveBeenCalled();
    });

    it("should not trigger sync when page becomes visible but offline", () => {
      vi.mocked(api.processSyncQueue).mockResolvedValue({ processed: 0, failed: 0 });

      Object.defineProperty(document, "hidden", {
        writable: true,
        configurable: true,
        value: false
      });

      Object.defineProperty(navigator, "onLine", {
        writable: true,
        configurable: true,
        value: false
      });

      setupSyncListeners();

      const visibilityEvent = new Event("visibilitychange");
      document.dispatchEvent(visibilityEvent);

      expect(api.processSyncQueue).not.toHaveBeenCalled();
    });
  });
});
