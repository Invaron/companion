import { describe, expect, it } from "vitest";
import { RuntimeStore } from "./store.js";

describe("RuntimeStore user connection credentials", () => {
  it("stores connector credentials encrypted at rest and returns decrypted payload", () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({
      email: "user-1@example.com",
      passwordHash: "hash",
      role: "user"
    });
    const userId = user.id;
    const credentials = JSON.stringify({
      token: "canvas-secret-token",
      baseUrl: "https://example.instructure.com"
    });

    store.upsertUserConnection({
      userId,
      service: "canvas",
      credentials,
      displayLabel: "Canvas LMS"
    });

    const connection = store.getUserConnection(userId, "canvas");
    expect(connection?.credentials).toBe(credentials);

    const db = (store as any).db;
    const row = db
      .prepare("SELECT credentials FROM user_connections WHERE userId = ? AND service = ?")
      .get(userId, "canvas") as { credentials: string } | undefined;

    expect(row?.credentials.startsWith("enc:v1:")).toBe(true);
    expect(row?.credentials.includes("canvas-secret-token")).toBe(false);
  });

  it("migrates legacy plaintext connector credentials to encrypted storage", () => {
    const store = new RuntimeStore(":memory:");
    const db = (store as any).db;
    const user = store.createUser({
      email: "user-2@example.com",
      passwordHash: "hash",
      role: "user"
    });
    const userId = user.id;
    const legacyCredentials = JSON.stringify({ token: "legacy-token" });

    db.prepare(`
      INSERT INTO user_connections (id, userId, service, credentials, displayLabel, connectedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "conn-legacy",
      userId,
      "canvas",
      legacyCredentials,
      "Canvas LMS",
      "2026-02-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z"
    );

    (store as any).migrateUserConnectionCredentialsEncryption();

    const row = db
      .prepare("SELECT credentials FROM user_connections WHERE id = ?")
      .get("conn-legacy") as { credentials: string } | undefined;

    expect(row?.credentials.startsWith("enc:v1:")).toBe(true);

    const connection = store.getUserConnection(userId, "canvas");
    expect(connection?.credentials).toBe(legacyCredentials);
  });
});
