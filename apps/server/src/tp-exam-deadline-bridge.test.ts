import { describe, expect, it } from "vitest";
import type { ImportedCalendarEvent } from "./calendar-import.js";
import { RuntimeStore } from "./store.js";
import { extractTPExamDeadlineCandidates, TPExamDeadlineBridge } from "./tp-exam-deadline-bridge.js";

describe("tp exam deadline bridge", () => {
  it("extracts exam candidates from TP events", () => {
    const events: ImportedCalendarEvent[] = [
      {
        summary: "DAT600 Skriftlig eksamen (WISEFLOW)",
        startTime: "2026-05-15T09:00:00.000Z",
        endTime: "2026-05-15T13:00:00.000Z"
      },
      {
        summary: "DAT520 Forelesning",
        startTime: "2026-05-12T10:15:00.000Z",
        endTime: "2026-05-12T12:00:00.000Z"
      }
    ];

    const candidates = extractTPExamDeadlineCandidates(events, new Date("2026-02-20T00:00:00.000Z"));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      course: "DAT600",
      task: "Skriftlig eksamen (WISEFLOW)",
      dueDate: "2026-05-15T09:00:00.000Z",
      sourceDueDate: "2026-05-15T09:00:00.000Z"
    });
  });

  it("creates deadlines from extracted TP exam candidates", () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({ email: "tp-exam@example.com", passwordHash: "", role: "user" });

    const bridge = new TPExamDeadlineBridge(store, user.id);
    const result = bridge.syncExamDeadlines(
      [
        {
          summary: "DAT560 Written exam (WISEFLOW)",
          startTime: "2026-05-20T09:00:00.000Z",
          endTime: "2026-05-20T13:00:00.000Z"
        },
        {
          summary: "DAT520 Skriftlig eksamen (WISEFLOW)",
          startTime: "2026-05-29T09:00:00.000Z",
          endTime: "2026-05-29T13:00:00.000Z"
        }
      ],
      new Date("2026-02-20T00:00:00.000Z")
    );

    expect(result.candidates).toBe(2);
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);

    const deadlines = store
      .getDeadlines(user.id, new Date("2026-02-20T00:00:00.000Z"), false)
      .filter((deadline) => deadline.course === "DAT560" || deadline.course === "DAT520");

    expect(deadlines).toHaveLength(2);
    expect(deadlines.every((deadline) => deadline.sourceDueDate === deadline.dueDate)).toBe(true);
  });

  it("updates managed exam deadlines when TP source due date changes", () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({ email: "tp-exam-update@example.com", passwordHash: "", role: "user" });

    const existing = store.createDeadline(user.id, {
      course: "DAT600",
      task: "Skriftlig eksamen (WISEFLOW)",
      dueDate: "2026-05-15T09:00:00.000Z",
      sourceDueDate: "2026-05-15T09:00:00.000Z",
      priority: "high",
      completed: false
    });

    const bridge = new TPExamDeadlineBridge(store, user.id);
    const result = bridge.syncExamDeadlines(
      [
        {
          summary: "DAT600 Skriftlig eksamen (WISEFLOW)",
          startTime: "2026-05-16T09:00:00.000Z",
          endTime: "2026-05-16T13:00:00.000Z"
        }
      ],
      new Date("2026-02-20T00:00:00.000Z")
    );

    expect(result.updated).toBe(1);

    const updated = store.getDeadlineById(user.id, existing.id, false);
    expect(updated?.sourceDueDate).toBe("2026-05-16T09:00:00.000Z");
    expect(updated?.dueDate).toBe("2026-05-16T09:00:00.000Z");
  });

  it("keeps user-overridden due dates while updating TP source due date", () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({ email: "tp-exam-override@example.com", passwordHash: "", role: "user" });

    const existing = store.createDeadline(user.id, {
      course: "DAT560",
      task: "Written exam (WISEFLOW)",
      dueDate: "2026-05-20T07:30:00.000Z",
      sourceDueDate: "2026-05-20T09:00:00.000Z",
      priority: "high",
      completed: false
    });

    const bridge = new TPExamDeadlineBridge(store, user.id);
    const result = bridge.syncExamDeadlines(
      [
        {
          summary: "DAT560 Written exam (WISEFLOW)",
          startTime: "2026-05-21T09:00:00.000Z",
          endTime: "2026-05-21T13:00:00.000Z"
        }
      ],
      new Date("2026-02-20T00:00:00.000Z")
    );

    expect(result.updated).toBe(1);

    const updated = store.getDeadlineById(user.id, existing.id, false);
    expect(updated?.sourceDueDate).toBe("2026-05-21T09:00:00.000Z");
    expect(updated?.dueDate).toBe("2026-05-20T07:30:00.000Z");
  });

  it("does not overwrite manual deadlines with no sourceDueDate", () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({ email: "tp-exam-manual@example.com", passwordHash: "", role: "user" });

    store.createDeadline(user.id, {
      course: "DAT520",
      task: "Skriftlig eksamen (WISEFLOW)",
      dueDate: "2026-05-29T09:00:00.000Z",
      priority: "high",
      completed: false
    });

    const bridge = new TPExamDeadlineBridge(store, user.id);
    const result = bridge.syncExamDeadlines(
      [
        {
          summary: "DAT520 Skriftlig eksamen (WISEFLOW)",
          startTime: "2026-05-29T09:00:00.000Z",
          endTime: "2026-05-29T13:00:00.000Z"
        }
      ],
      new Date("2026-02-20T00:00:00.000Z")
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);

    const deadlines = store.getDeadlines(user.id, new Date("2026-02-20T00:00:00.000Z"), false);
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.sourceDueDate).toBeUndefined();
  });
});
