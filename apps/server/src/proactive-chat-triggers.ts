import { Deadline, LectureEvent, UserContext, Notification, ChatMessage } from "./types.js";
import { RuntimeStore } from "./store.js";
import { sendChatMessage } from "./chat.js";

/**
 * Proactive chat trigger types
 */
export type ProactiveTriggerType =
  | "morning-briefing"
  | "schedule-gap"
  | "deadline-approaching"
  | "post-lecture"
  | "evening-reflection";

export interface ProactiveTrigger {
  type: ProactiveTriggerType;
  scheduledFor: Date;
  prompt: string;
  priority: "low" | "medium" | "high";
}

/**
 * Check if it's time for the morning briefing (8am)
 */
export function shouldTriggerMorningBriefing(now: Date, lastMessage: ChatMessage | null): boolean {
  const hour = now.getHours();

  // Trigger at 8am
  if (hour !== 8) {
    return false;
  }

  // Don't trigger if we already sent one today
  if (lastMessage) {
    const lastMessageDate = new Date(lastMessage.timestamp);
    const isSameDay = lastMessageDate.getDate() === now.getDate() &&
                      lastMessageDate.getMonth() === now.getMonth() &&
                      lastMessageDate.getFullYear() === now.getFullYear();

    if (isSameDay && lastMessageDate.getHours() >= 8) {
      return false;
    }
  }

  return true;
}

/**
 * Detect significant schedule gaps (>2 hours between lectures)
 */
export function detectScheduleGaps(scheduleEvents: LectureEvent[], now: Date): ProactiveTrigger | null {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get today's events
  const todayEvents = scheduleEvents
    .filter(event => {
      const eventDate = new Date(event.startTime);
      return eventDate >= today && eventDate < tomorrow;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (todayEvents.length < 2) {
    return null;
  }

  // Check for gaps between consecutive events
  for (let i = 0; i < todayEvents.length - 1; i++) {
    const current = todayEvents[i];
    const next = todayEvents[i + 1];

    const currentEnd = new Date(current.startTime).getTime() + (current.durationMinutes * 60 * 1000);
    const nextStart = new Date(next.startTime).getTime();
    const gapMinutes = (nextStart - currentEnd) / (60 * 1000);

    // If gap is > 2 hours and we're near the end of the current lecture
    if (gapMinutes > 120) {
      const timeUntilCurrentEnd = currentEnd - now.getTime();
      const minutesUntilCurrentEnd = timeUntilCurrentEnd / (60 * 1000);

      // Trigger when we're within the last 30 minutes of the current lecture
      // or within 30 minutes after it ends
      if (minutesUntilCurrentEnd >= -30 && minutesUntilCurrentEnd <= 30) {
        return {
          type: "schedule-gap",
          scheduledFor: new Date(currentEnd),
          prompt: `You have a ${Math.floor(gapMinutes / 60)}-hour gap coming up after ${current.title}. How would you like to use this time?`,
          priority: "medium"
        };
      }
    }
  }

  return null;
}

/**
 * Check for approaching deadlines (<48 hours)
 */
export function detectApproachingDeadlines(deadlines: Deadline[], now: Date): ProactiveTrigger | null {
  const upcomingDeadlines = deadlines.filter(deadline => {
    if (deadline.completed) {
      return false;
    }

    const dueDate = new Date(deadline.dueDate);
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntilDue > 0 && hoursUntilDue <= 48;
  });

  if (upcomingDeadlines.length === 0) {
    return null;
  }

  // Get the most urgent one
  const mostUrgent = upcomingDeadlines.sort((a, b) => {
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  })[0];

  const dueDate = new Date(mostUrgent.dueDate);
  const hoursUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));

  return {
    type: "deadline-approaching",
    scheduledFor: now,
    prompt: `${mostUrgent.task} for ${mostUrgent.course} is due in ${hoursUntilDue} hours. How's your progress?`,
    priority: hoursUntilDue <= 24 ? "high" : "medium"
  };
}

/**
 * Check for post-lecture check-in (30 minutes after lecture ends)
 */
export function detectPostLectureCheckIn(scheduleEvents: LectureEvent[], now: Date): ProactiveTrigger | null {
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Find recently ended lectures
  const recentlyEnded = scheduleEvents.filter(event => {
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(eventStart.getTime() + event.durationMinutes * 60 * 1000);

    // Event ended between 30-60 minutes ago
    return eventEnd >= oneHourAgo && eventEnd <= thirtyMinutesAgo;
  });

  if (recentlyEnded.length === 0) {
    return null;
  }

  const lecture = recentlyEnded[0];

  return {
    type: "post-lecture",
    scheduledFor: now,
    prompt: `How was ${lecture.title}? Want to capture any notes or reflections?`,
    priority: "low"
  };
}

/**
 * Check if it's time for evening reflection (8pm)
 */
export function shouldTriggerEveningReflection(now: Date, lastMessage: ChatMessage | null): boolean {
  const hour = now.getHours();

  // Trigger at 8pm
  if (hour !== 20) {
    return false;
  }

  // Don't trigger if we already sent one this evening
  if (lastMessage) {
    const lastMessageDate = new Date(lastMessage.timestamp);
    const isSameDay = lastMessageDate.getDate() === now.getDate() &&
                      lastMessageDate.getMonth() === now.getMonth() &&
                      lastMessageDate.getFullYear() === now.getFullYear();

    if (isSameDay && lastMessageDate.getHours() >= 20) {
      return false;
    }
  }

  return true;
}

/**
 * Generate all pending proactive triggers
 */
export function generateProactiveTriggers(
  store: RuntimeStore,
  now: Date = new Date()
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];
  const recentMessages = store.getRecentChatMessages(10);
  const lastMessage = recentMessages.length > 0 ? recentMessages[0] : null;

  // Morning briefing (8am)
  if (shouldTriggerMorningBriefing(now, lastMessage)) {
    triggers.push({
      type: "morning-briefing",
      scheduledFor: now,
      prompt: "Good morning! What's your day looking like?",
      priority: "medium"
    });
  }

  // Evening reflection (8pm)
  if (shouldTriggerEveningReflection(now, lastMessage)) {
    triggers.push({
      type: "evening-reflection",
      scheduledFor: now,
      prompt: "How was your day? Want to reflect on what you accomplished?",
      priority: "low"
    });
  }

  // Schedule gap detection
  const scheduleGap = detectScheduleGaps(store.getScheduleEvents(), now);
  if (scheduleGap) {
    triggers.push(scheduleGap);
  }

  // Approaching deadlines
  const deadlineTrigger = detectApproachingDeadlines(store.getDeadlines(), now);
  if (deadlineTrigger) {
    triggers.push(deadlineTrigger);
  }

  // Post-lecture check-in
  const postLecture = detectPostLectureCheckIn(store.getScheduleEvents(), now);
  if (postLecture) {
    triggers.push(postLecture);
  }

  return triggers;
}

/**
 * Convert a proactive trigger into a push notification
 */
export function triggerToNotification(trigger: ProactiveTrigger): Omit<Notification, "id" | "timestamp"> {
  const titles: Record<ProactiveTriggerType, string> = {
    "morning-briefing": "Good morning!",
    "schedule-gap": "Free time ahead",
    "deadline-approaching": "Deadline reminder",
    "post-lecture": "Lecture reflection",
    "evening-reflection": "Evening check-in"
  };

  return {
    source: "orchestrator",
    title: titles[trigger.type],
    message: trigger.prompt,
    priority: trigger.priority,
    actions: ["view"],
    url: "/companion/#/chat",
    metadata: {
      triggerType: trigger.type,
      proactiveMessage: true
    }
  };
}

/**
 * Process proactive triggers and queue as notifications
 */
export function processProactiveTriggers(store: RuntimeStore, now: Date = new Date()): number {
  const triggers = generateProactiveTriggers(store, now);

  for (const trigger of triggers) {
    const notification = triggerToNotification(trigger);
    store.pushNotification(notification);
  }

  return triggers.length;
}
