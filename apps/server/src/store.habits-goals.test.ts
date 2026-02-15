import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeStore } from "./store.js";

describe("RuntimeStore - habits and goals", () => {
  let store: RuntimeStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T12:00:00.000Z"));
    store = new RuntimeStore(":memory:");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates habits and tracks daily streaks", () => {
    const habit = store.createHabit({
      name: "Evening stretch",
      cadence: "daily",
      targetPerWeek: 6,
      motivation: "Stay loose after study sessions"
    });

    store.toggleHabitCheckIn(habit.id, { date: "2026-02-14T18:00:00.000Z", completed: true });
    const updated = store.toggleHabitCheckIn(habit.id, { date: "2026-02-15T07:30:00.000Z", completed: true });

    expect(updated).not.toBeNull();
    expect(updated?.todayCompleted).toBe(true);
    expect(updated?.streak).toBe(2);
    expect(updated?.recentCheckIns[6].completed).toBe(true);
    expect(updated?.completionRate7d).toBeGreaterThan(0);
  });

  it("tracks goal progress, remaining counts, and allows toggling check-ins", () => {
    const goal = store.createGoal({
      title: "Ship resume updates",
      cadence: "daily",
      targetCount: 3,
      dueDate: "2026-02-20T00:00:00.000Z"
    });

    store.toggleGoalCheckIn(goal.id, { date: "2026-02-14T12:00:00.000Z", completed: true });
    const status = store.toggleGoalCheckIn(goal.id, { completed: true });

    expect(status).not.toBeNull();
    expect(status?.progressCount).toBeGreaterThanOrEqual(2);
    expect(status?.remaining).toBeLessThanOrEqual(1);
    expect(status?.streak).toBeGreaterThanOrEqual(1);

    const reversed = store.toggleGoalCheckIn(goal.id, { completed: false });
    expect(reversed?.progressCount).toBe(status?.progressCount ? status.progressCount - 1 : 0);
  });
});
