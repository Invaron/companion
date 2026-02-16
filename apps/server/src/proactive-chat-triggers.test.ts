import { describe, it, expect } from "vitest";
import {
  shouldTriggerMorningBriefing,
  shouldTriggerEveningReflection,
  detectScheduleGaps,
  detectApproachingDeadlines,
  detectPostLectureCheckIn,
  generateProactiveTriggers,
  triggerToNotification
} from "./proactive-chat-triggers.js";
import { ChatMessage, Deadline, LectureEvent } from "./types.js";
import { RuntimeStore } from "./store.js";

describe("proactive-chat-triggers", () => {
  describe("shouldTriggerMorningBriefing", () => {
    it("should trigger at 8am with no recent messages", () => {
      const now = new Date("2026-02-16T08:00:00Z");
      expect(shouldTriggerMorningBriefing(now, null)).toBe(true);
    });

    it("should not trigger at other hours", () => {
      const now = new Date("2026-02-16T09:00:00Z");
      expect(shouldTriggerMorningBriefing(now, null)).toBe(false);
    });

    it("should not trigger if already sent today", () => {
      const now = new Date("2026-02-16T08:30:00Z");
      const lastMessage: ChatMessage = {
        id: "msg-1",
        role: "assistant",
        content: "Good morning!",
        timestamp: "2026-02-16T08:00:00Z"
      };
      expect(shouldTriggerMorningBriefing(now, lastMessage)).toBe(false);
    });

    it("should trigger if last message was yesterday", () => {
      const now = new Date("2026-02-16T08:00:00Z");
      const lastMessage: ChatMessage = {
        id: "msg-1",
        role: "assistant",
        content: "Good morning!",
        timestamp: "2026-02-15T08:00:00Z"
      };
      expect(shouldTriggerMorningBriefing(now, lastMessage)).toBe(true);
    });
  });

  describe("shouldTriggerEveningReflection", () => {
    it("should trigger at 8pm with no recent messages", () => {
      const now = new Date("2026-02-16T20:00:00Z");
      expect(shouldTriggerEveningReflection(now, null)).toBe(true);
    });

    it("should not trigger at other hours", () => {
      const now = new Date("2026-02-16T19:00:00Z");
      expect(shouldTriggerEveningReflection(now, null)).toBe(false);
    });

    it("should not trigger if already sent this evening", () => {
      const now = new Date("2026-02-16T20:30:00Z");
      const lastMessage: ChatMessage = {
        id: "msg-1",
        role: "assistant",
        content: "Evening reflection",
        timestamp: "2026-02-16T20:00:00Z"
      };
      expect(shouldTriggerEveningReflection(now, lastMessage)).toBe(false);
    });
  });

  describe("detectScheduleGaps", () => {
    it("should detect a large gap between lectures", () => {
      const now = new Date("2026-02-16T11:00:00Z");
      const events: LectureEvent[] = [
        {
          id: "lec-1",
          title: "DAT520 Lecture",
          startTime: "2026-02-16T10:00:00Z",
          durationMinutes: 90,
          workload: "medium"
        },
        {
          id: "lec-2",
          title: "DAT560 Lecture",
          startTime: "2026-02-16T14:00:00Z",
          durationMinutes: 90,
          workload: "medium"
        }
      ];

      const trigger = detectScheduleGaps(events, now);
      expect(trigger).toBeTruthy();
      expect(trigger?.type).toBe("schedule-gap");
      expect(trigger?.priority).toBe("medium");
    });

    it("should not detect small gaps", () => {
      const now = new Date("2026-02-16T11:00:00Z");
      const events: LectureEvent[] = [
        {
          id: "lec-1",
          title: "DAT520 Lecture",
          startTime: "2026-02-16T10:00:00Z",
          durationMinutes: 90,
          workload: "medium"
        },
        {
          id: "lec-2",
          title: "DAT560 Lecture",
          startTime: "2026-02-16T12:00:00Z",
          durationMinutes: 90,
          workload: "medium"
        }
      ];

      const trigger = detectScheduleGaps(events, now);
      expect(trigger).toBeNull();
    });

    it("should return null if no events scheduled", () => {
      const now = new Date("2026-02-16T11:00:00Z");
      const trigger = detectScheduleGaps([], now);
      expect(trigger).toBeNull();
    });
  });

  describe("detectApproachingDeadlines", () => {
    it("should detect deadline within 48 hours", () => {
      const now = new Date("2026-02-16T10:00:00Z");
      const deadlines: Deadline[] = [
        {
          id: "dl-1",
          task: "Lab 3",
          course: "DAT520",
          dueDate: "2026-02-17T23:59:00Z",
          priority: "high",
          completed: false
        }
      ];

      const trigger = detectApproachingDeadlines(deadlines, now);
      expect(trigger).toBeTruthy();
      expect(trigger?.type).toBe("deadline-approaching");
      expect(trigger?.priority).toBe("medium");
    });

    it("should escalate priority for deadlines within 24 hours", () => {
      const now = new Date("2026-02-16T10:00:00Z");
      const deadlines: Deadline[] = [
        {
          id: "dl-1",
          task: "Lab 3",
          course: "DAT520",
          dueDate: "2026-02-16T23:59:00Z",
          priority: "high",
          completed: false
        }
      ];

      const trigger = detectApproachingDeadlines(deadlines, now);
      expect(trigger?.priority).toBe("high");
    });

    it("should ignore completed deadlines", () => {
      const now = new Date("2026-02-16T10:00:00Z");
      const deadlines: Deadline[] = [
        {
          id: "dl-1",
          task: "Lab 3",
          course: "DAT520",
          dueDate: "2026-02-17T23:59:00Z",
          priority: "high",
          completed: true
        }
      ];

      const trigger = detectApproachingDeadlines(deadlines, now);
      expect(trigger).toBeNull();
    });

    it("should return null for deadlines beyond 48 hours", () => {
      const now = new Date("2026-02-16T10:00:00Z");
      const deadlines: Deadline[] = [
        {
          id: "dl-1",
          task: "Lab 3",
          course: "DAT520",
          dueDate: "2026-02-20T23:59:00Z",
          priority: "high",
          completed: false
        }
      ];

      const trigger = detectApproachingDeadlines(deadlines, now);
      expect(trigger).toBeNull();
    });
  });

  describe("detectPostLectureCheckIn", () => {
    it("should trigger 30-60 minutes after lecture ends", () => {
      const now = new Date("2026-02-16T12:00:00Z");
      const events: LectureEvent[] = [
        {
          id: "lec-1",
          title: "DAT520 Lecture",
          startTime: "2026-02-16T10:00:00Z",
          durationMinutes: 90, // ends at 11:30
          workload: "medium"
        }
      ];

      const trigger = detectPostLectureCheckIn(events, now);
      expect(trigger).toBeTruthy();
      expect(trigger?.type).toBe("post-lecture");
      expect(trigger?.priority).toBe("low");
    });

    it("should not trigger immediately after lecture", () => {
      const now = new Date("2026-02-16T11:35:00Z");
      const events: LectureEvent[] = [
        {
          id: "lec-1",
          title: "DAT520 Lecture",
          startTime: "2026-02-16T10:00:00Z",
          durationMinutes: 90,
          workload: "medium"
        }
      ];

      const trigger = detectPostLectureCheckIn(events, now);
      expect(trigger).toBeNull();
    });

    it("should not trigger more than 60 minutes after lecture", () => {
      const now = new Date("2026-02-16T13:00:00Z");
      const events: LectureEvent[] = [
        {
          id: "lec-1",
          title: "DAT520 Lecture",
          startTime: "2026-02-16T10:00:00Z",
          durationMinutes: 90,
          workload: "medium"
        }
      ];

      const trigger = detectPostLectureCheckIn(events, now);
      expect(trigger).toBeNull();
    });
  });

  describe("triggerToNotification", () => {
    it("should convert morning briefing trigger to notification", () => {
      const trigger = {
        type: "morning-briefing" as const,
        scheduledFor: new Date("2026-02-16T08:00:00Z"),
        prompt: "Good morning! What's your day looking like?",
        priority: "medium" as const
      };

      const notification = triggerToNotification(trigger);
      expect(notification.title).toBe("Good morning!");
      expect(notification.message).toBe("Good morning! What's your day looking like?");
      expect(notification.priority).toBe("medium");
      expect(notification.source).toBe("orchestrator");
      expect(notification.actions).toContain("view");
      expect(notification.metadata?.triggerType).toBe("morning-briefing");
      expect(notification.metadata?.proactiveMessage).toBe(true);
    });

    it("should convert deadline trigger to notification", () => {
      const trigger = {
        type: "deadline-approaching" as const,
        scheduledFor: new Date(),
        prompt: "Lab 3 is due in 12 hours",
        priority: "high" as const
      };

      const notification = triggerToNotification(trigger);
      expect(notification.title).toBe("Deadline reminder");
      expect(notification.priority).toBe("high");
    });
  });

  describe("generateProactiveTriggers integration", () => {
    it("should generate multiple triggers when conditions are met", () => {
      const store = new RuntimeStore(":memory:");

      // Set up schedule with a gap
      store.createLectureEvent({
        title: "DAT520 Lecture",
        startTime: new Date("2026-02-16T10:00:00Z").toISOString(),
        durationMinutes: 90,
        workload: "medium"
      });

      store.createLectureEvent({
        title: "DAT560 Lecture",
        startTime: new Date("2026-02-16T14:00:00Z").toISOString(),
        durationMinutes: 90,
        workload: "medium"
      });

      // Add approaching deadline
      store.createDeadline({
        task: "Lab 3",
        course: "DAT520",
        dueDate: new Date("2026-02-17T23:59:00Z").toISOString(),
        priority: "high",
        completed: false
      });

      // Check at 8am - should trigger morning briefing + deadline
      const morning = new Date("2026-02-16T08:00:00Z");
      const morningTriggers = generateProactiveTriggers(store, morning);

      expect(morningTriggers.length).toBeGreaterThan(0);
      expect(morningTriggers.some(t => t.type === "morning-briefing")).toBe(true);
      expect(morningTriggers.some(t => t.type === "deadline-approaching")).toBe(true);
    });
  });
});
