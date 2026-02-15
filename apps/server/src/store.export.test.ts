import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeStore } from "./store.js";

describe("RuntimeStore - export data", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports all user data including journals, schedule, deadlines, context, and preferences", () => {
    const store = new RuntimeStore(":memory:");

    // Create test data
    store.recordJournalEntry("Finished algorithms homework");
    store.recordJournalEntry("Had a productive study session");

    store.createLectureEvent({
      title: "Algorithms Lecture",
      startTime: "2026-02-16T10:00:00.000Z",
      durationMinutes: 90,
      workload: "high"
    });

    store.createDeadline({
      course: "Systems",
      task: "Lab Report",
      dueDate: "2026-02-20T23:59:00.000Z",
      priority: "high",
      completed: false
    });

    store.setUserContext({
      stressLevel: "medium",
      energyLevel: "high",
      mode: "focus"
    });

    store.setNotificationPreferences({
      quietHours: { enabled: true, startHour: 22, endHour: 7 },
      minimumPriority: "medium",
      allowCriticalInQuietHours: true
    });

    // Get export data
    const exportData = store.getExportData();

    // Verify structure
    expect(exportData).toHaveProperty("exportedAt");
    expect(exportData).toHaveProperty("version");
    expect(exportData).toHaveProperty("journals");
    expect(exportData).toHaveProperty("schedule");
    expect(exportData).toHaveProperty("deadlines");
    expect(exportData).toHaveProperty("userContext");
    expect(exportData).toHaveProperty("notificationPreferences");

    // Verify version
    expect(exportData.version).toBe("1.0");

    // Verify timestamp
    expect(exportData.exportedAt).toBe("2026-02-15T15:00:00.000Z");

    // Verify journals (ordered by timestamp DESC)
    expect(exportData.journals).toHaveLength(2);
    expect(exportData.journals[0].content).toBe("Finished algorithms homework");
    expect(exportData.journals[1].content).toBe("Had a productive study session");

    // Verify schedule
    expect(exportData.schedule).toHaveLength(1);
    expect(exportData.schedule[0].title).toBe("Algorithms Lecture");
    expect(exportData.schedule[0].workload).toBe("high");

    // Verify deadlines
    expect(exportData.deadlines).toHaveLength(1);
    expect(exportData.deadlines[0].course).toBe("Systems");
    expect(exportData.deadlines[0].completed).toBe(false);

    // Verify user context
    expect(exportData.userContext.stressLevel).toBe("medium");
    expect(exportData.userContext.energyLevel).toBe("high");
    expect(exportData.userContext.mode).toBe("focus");

    // Verify notification preferences
    expect(exportData.notificationPreferences.quietHours.enabled).toBe(true);
    expect(exportData.notificationPreferences.minimumPriority).toBe("medium");
  });

  it("exports empty arrays when no data exists", () => {
    const store = new RuntimeStore(":memory:");
    const exportData = store.getExportData();

    expect(exportData.journals).toEqual([]);
    expect(exportData.schedule).toEqual([]);
    expect(exportData.deadlines).toEqual([]);
    expect(exportData.userContext).toBeDefined();
    expect(exportData.notificationPreferences).toBeDefined();
  });
});
