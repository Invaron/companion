import { describe, expect, it } from "vitest";
import {
  AuthService,
  createPasswordHash,
  parseBearerToken,
  verifyPassword
} from "./auth.js";
import { RuntimeStore } from "./store.js";

describe("auth", () => {
  it("creates and verifies password hashes", () => {
    const hash = createPasswordHash("super-secret-password");
    expect(verifyPassword("super-secret-password", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("parses bearer token header", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
    expect(parseBearerToken("bearer xyz")).toBe("xyz");
    expect(parseBearerToken("Token abc")).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("bootstraps admin and authenticates sessions", () => {
    const store = new RuntimeStore(":memory:");
    const service = new AuthService(store, {
      required: true,
      adminEmail: "admin@example.com",
      adminPassword: "very-strong-password",
      sessionTtlHours: 24
    });

    const admin = service.bootstrapAdminUser();
    expect(admin?.email).toBe("admin@example.com");
    expect(admin?.role).toBe("admin");

    const login = service.login("admin@example.com", "very-strong-password");
    expect(login).not.toBeNull();

    const context = service.authenticateFromAuthorizationHeader(`Bearer ${login!.token}`);
    expect(context).not.toBeNull();
    expect(context?.user.email).toBe("admin@example.com");

    expect(service.logout(login!.token)).toBe(true);
    expect(service.authenticateToken(login!.token)).toBeNull();
  });

  it("identifies pro-whitelisted emails", () => {
    const store = new RuntimeStore(":memory:");
    const service = new AuthService(store, {
      required: true,
      adminEmail: "admin@example.com",
      adminPassword: "very-strong-password",
      sessionTtlHours: 24,
      proWhitelistEmails: "friend1@gmail.com, Friend2@Gmail.com ,friend3@example.com"
    });

    expect(service.isProWhitelisted("friend1@gmail.com")).toBe(true);
    expect(service.isProWhitelisted("Friend1@Gmail.com")).toBe(true);
    expect(service.isProWhitelisted("friend2@gmail.com")).toBe(true);
    expect(service.isProWhitelisted("friend3@example.com")).toBe(true);
    expect(service.isProWhitelisted("stranger@example.com")).toBe(false);

    const emails = service.getProWhitelistEmails();
    expect(emails.size).toBe(3);
    expect(emails.has("friend1@gmail.com")).toBe(true);
  });

  it("returns empty whitelist when not configured", () => {
    const store = new RuntimeStore(":memory:");
    const service = new AuthService(store, {
      required: false,
      sessionTtlHours: 24
    });

    expect(service.isProWhitelisted("anyone@example.com")).toBe(false);
    expect(service.getProWhitelistEmails().size).toBe(0);
  });
});
