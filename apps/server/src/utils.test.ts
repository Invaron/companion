import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeId, nowIso } from "./utils.js";

describe("utils", () => {
  describe("makeId", () => {
    it("should generate an ID with the given prefix", () => {
      const id = makeId("test");
      expect(id).toMatch(/^test-\d+-\d+$/);
    });

    it("should include a timestamp in the ID", () => {
      const before = Date.now();
      const id = makeId("prefix");
      const after = Date.now();

      const parts = id.split("-");
      const timestamp = parseInt(parts[1]);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("should increment the sequence number", () => {
      const id1 = makeId("seq");
      const id2 = makeId("seq");
      const id3 = makeId("seq");

      const seq1 = parseInt(id1.split("-")[2]);
      const seq2 = parseInt(id2.split("-")[2]);
      const seq3 = parseInt(id3.split("-")[2]);

      expect(seq2).toBe(seq1 + 1);
      expect(seq3).toBe(seq2 + 1);
    });

    it("should generate unique IDs for different prefixes", () => {
      const id1 = makeId("prefix1");
      const id2 = makeId("prefix2");

      expect(id1).not.toBe(id2);
      expect(id1.startsWith("prefix1-")).toBe(true);
      expect(id2.startsWith("prefix2-")).toBe(true);
    });

    it("should handle empty prefix", () => {
      const id = makeId("");
      expect(id).toMatch(/^-\d+-\d+$/);
    });
  });

  describe("nowIso", () => {
    it("should return a valid ISO 8601 timestamp", () => {
      const timestamp = nowIso();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should return the current time", () => {
      const before = new Date().toISOString();
      const timestamp = nowIso();
      const after = new Date().toISOString();

      expect(timestamp >= before).toBe(true);
      expect(timestamp <= after).toBe(true);
    });

    it("should return a parseable date", () => {
      const timestamp = nowIso();
      const date = new Date(timestamp);
      expect(date.toISOString()).toBe(timestamp);
    });

    it("should be callable multiple times", () => {
      // When called multiple times, all should return valid ISO timestamps
      const t1 = nowIso();
      const t2 = nowIso();
      const t3 = nowIso();

      expect(t1).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(t2).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(t3).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
