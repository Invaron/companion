import {
  buildDigestNotification,
  isDigestCandidate,
} from "./notification-digest-batching.js";
import { RuntimeStore } from "./store.js";
import { ScheduledNotification } from "./types.js";
import { checkProactiveTriggersWithCooldown } from "./proactive-chat-triggers.js";

export class OrchestratorRuntime {
  private timers: NodeJS.Timeout[] = [];
  private readonly deadlineReminderIntervalMs = 60_000;
  private readonly deadlineReminderCooldownMinutes = 180;
  private readonly scheduledNotificationCheckIntervalMs = 30_000;
  private readonly proactiveTriggerCheckIntervalMs = 5 * 60 * 1000;

  constructor(private readonly store: RuntimeStore, private readonly userId: string) {}

  start(): void {
    // Overdue deadline reminders (real deadlines from Canvas/TP)
    this.emitOverdueDeadlineReminders();
    const deadlineReminderTimer = setInterval(() => {
      this.emitOverdueDeadlineReminders();
    }, this.deadlineReminderIntervalMs);
    this.timers.push(deadlineReminderTimer);

    // Process scheduled notifications (Gemini-created reminders)
    this.processScheduledNotifications();
    const scheduledNotifTimer = setInterval(() => {
      this.processScheduledNotifications();
    }, this.scheduledNotificationCheckIntervalMs);
    this.timers.push(scheduledNotifTimer);

    // Check proactive chat triggers
    this.checkProactiveTriggers();
    const proactiveTriggerTimer = setInterval(() => {
      this.checkProactiveTriggers();
    }, this.proactiveTriggerCheckIntervalMs);
    this.timers.push(proactiveTriggerTimer);
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }

    this.timers = [];
  }

  private emitOverdueDeadlineReminders(): void {
    const overdueDeadlines = this.store.getOverdueDeadlinesRequiringReminder(
      this.userId,
      new Date().toISOString(),
      this.deadlineReminderCooldownMinutes
    );

    for (const deadline of overdueDeadlines) {
      const reminder = this.store.recordDeadlineReminder(this.userId, deadline.id);

      if (!reminder) {
        continue;
      }

      const overdueMs = Date.now() - new Date(deadline.dueDate).getTime();
      const overdueHours = Math.max(1, Math.floor(overdueMs / (60 * 60 * 1000)));

      // Overdue reminders are always urgent
      this.store.pushNotification(this.userId, {
        source: "assignment-tracker",
        title: "Deadline status check",
        message: `${deadline.task} for ${deadline.course} is overdue by ${overdueHours}h. Mark complete or let me know you're still working.`,
        priority: deadline.priority === "critical" || overdueHours >= 24 ? "critical" : "high",
        metadata: {
          deadlineId: deadline.id
        },
        actions: ["complete", "working", "view"],
        url: `/companion/?tab=schedule&deadlineId=${encodeURIComponent(deadline.id)}`
      });
    }
  }

  /**
   * Process scheduled notifications that are now due
   */
  private processScheduledNotifications(): void {
    const dueNotifications = this.store.getDueScheduledNotifications(this.userId);
    if (dueNotifications.length === 0) {
      return;
    }

    console.log(`[orchestrator] processing ${dueNotifications.length} due notification(s)`);
    const digestCandidates = dueNotifications.filter((scheduled) => isDigestCandidate(scheduled));
    const immediateNotifications = dueNotifications.filter((scheduled) => !isDigestCandidate(scheduled));

    for (const scheduled of immediateNotifications) {
      console.log(`[orchestrator] delivering immediately: "${scheduled.notification.title}" (category=${scheduled.category ?? "none"})`);
      this.store.pushNotification(this.userId, scheduled.notification);
      this.rescheduleIfRecurring(scheduled);
      this.store.removeScheduledNotification(this.userId, scheduled.id);
    }

    if (digestCandidates.length > 0) {
      const digest = buildDigestNotification(digestCandidates, new Date());
      if (digest) {
        this.store.pushNotification(this.userId, digest);
      }

      for (const scheduled of digestCandidates) {
        this.rescheduleIfRecurring(scheduled);
        this.store.removeScheduledNotification(this.userId, scheduled.id);
      }
    }
  }

  /**
   * If a delivered notification has a recurrence, schedule the next occurrence
   */
  private rescheduleIfRecurring(scheduled: ScheduledNotification): void {
    if (!scheduled.recurrence || scheduled.recurrence === "none") {
      return;
    }

    const current = new Date(scheduled.scheduledFor);
    let next: Date;

    switch (scheduled.recurrence) {
      case "daily":
        next = new Date(current.getTime() + 24 * 60 * 60 * 1000);
        break;
      case "weekly":
        next = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case "monthly": {
        next = new Date(current);
        next.setMonth(next.getMonth() + 1);
        break;
      }
      default:
        return;
    }

    // Don't reschedule if the next occurrence would be more than 1 year out
    if (next.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      return;
    }

    this.store.scheduleNotification(
      this.userId,
      scheduled.notification,
      next,
      scheduled.eventId,
      scheduled.recurrence,
      scheduled.category
    );
  }

  /**
   * Check proactive chat triggers and queue notifications
   */
  private checkProactiveTriggers(): void {
    void (async () => {
      try {
        const notifications = await checkProactiveTriggersWithCooldown(this.store, this.userId);

        for (const notification of notifications) {
          this.store.pushNotification(this.userId, notification);
        }
      } catch (error) {
        // Log error but don't crash the orchestrator
        console.error("Failed to check proactive triggers:", error);
      }
    })();
  }
}
