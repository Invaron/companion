import { describe, expect, it } from "vitest";
import { RuntimeStore } from "./store.js";

describe("RuntimeStore - journal delete", () => {
  it("deletes an existing journal entry", () => {
    const store = new RuntimeStore(":memory:");
    const tag = store.createTag("swipe");
    const entry = store.recordJournalEntry("Delete me", [tag.id]);

    expect(store.getJournalEntries().some((item) => item.id === entry.id)).toBe(true);

    const deleted = store.deleteJournalEntry(entry.id);

    expect(deleted).toBe(true);
    expect(store.getJournalEntries().some((item) => item.id === entry.id)).toBe(false);
  });

  it("returns false when the journal entry does not exist", () => {
    const store = new RuntimeStore(":memory:");
    const deleted = store.deleteJournalEntry("missing-id");
    expect(deleted).toBe(false);
  });
});
