import type { ImportedCalendarEvent } from "./calendar-import.js";
import { RuntimeStore } from "./store.js";
import type { Deadline, Priority } from "./types.js";

const COURSE_CODE_REGEX = /\b[A-Z]{2,5}\d{3}\b/;
const EXAM_KEYWORD_REGEX = /\b(exam(?:en)?|eksamen|midterm|final|wiseflow)\b/i;

interface TPExamDeadlineCandidate {
  course: string;
  task: string;
  dueDate: string;
  sourceDueDate: string;
  priority: Priority;
}

export interface TPExamDeadlineBridgeResult {
  candidates: number;
  created: number;
  updated: number;
  skipped: number;
  createdDeadlines: Deadline[];
}

function normalizeTextKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCourseCode(summary: string): string | null {
  const match = summary.toUpperCase().match(COURSE_CODE_REGEX);
  return match?.[0] ?? null;
}

function toTitleCaseSentence(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildExamTaskLabel(summary: string, courseCode: string): string {
  const withoutCode = summary
    .replace(new RegExp(`\\b${courseCode}\\b`, "ig"), " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutCode) {
    return "Exam";
  }

  return toTitleCaseSentence(withoutCode);
}

function inferPriorityFromDueDate(dueDate: string, now: Date): Priority {
  const dueMs = Date.parse(dueDate);
  if (!Number.isFinite(dueMs)) {
    return "medium";
  }

  const diffHours = (dueMs - now.getTime()) / (60 * 60 * 1000);
  if (diffHours <= 24) {
    return "critical";
  }
  if (diffHours <= 96) {
    return "high";
  }
  return "medium";
}

function isExamEvent(event: ImportedCalendarEvent): boolean {
  const text = `${event.summary} ${event.description ?? ""}`;
  return EXAM_KEYWORD_REGEX.test(text);
}

function isExamDeadline(deadline: Deadline): boolean {
  const text = `${deadline.course} ${deadline.task}`;
  return EXAM_KEYWORD_REGEX.test(text);
}

export function extractTPExamDeadlineCandidates(
  events: ImportedCalendarEvent[],
  now: Date = new Date()
): TPExamDeadlineCandidate[] {
  const dedup = new Map<string, TPExamDeadlineCandidate>();

  for (const event of events) {
    if (!isExamEvent(event)) {
      continue;
    }

    const courseCode = extractCourseCode(event.summary);
    if (!courseCode) {
      continue;
    }

    const dueMs = Date.parse(event.startTime);
    if (!Number.isFinite(dueMs)) {
      continue;
    }
    if (dueMs <= now.getTime()) {
      continue;
    }

    const dueDate = new Date(dueMs).toISOString();
    const task = buildExamTaskLabel(event.summary, courseCode);
    const candidate: TPExamDeadlineCandidate = {
      course: courseCode,
      task,
      dueDate,
      sourceDueDate: dueDate,
      priority: inferPriorityFromDueDate(dueDate, now)
    };

    const dedupKey = `${candidate.course}|${normalizeTextKey(candidate.task)}|${candidate.dueDate}`;
    if (!dedup.has(dedupKey)) {
      dedup.set(dedupKey, candidate);
    }
  }

  return Array.from(dedup.values()).sort((left, right) => Date.parse(left.dueDate) - Date.parse(right.dueDate));
}

export class TPExamDeadlineBridge {
  private readonly store: RuntimeStore;
  private readonly userId: string;

  constructor(store: RuntimeStore, userId: string) {
    this.store = store;
    this.userId = userId;
  }

  syncExamDeadlines(events: ImportedCalendarEvent[], now: Date = new Date()): TPExamDeadlineBridgeResult {
    const candidates = extractTPExamDeadlineCandidates(events, now);
    const result: TPExamDeadlineBridgeResult = {
      candidates: candidates.length,
      created: 0,
      updated: 0,
      skipped: 0,
      createdDeadlines: []
    };

    if (candidates.length === 0) {
      return result;
    }

    const existingDeadlines = this.store.getDeadlines(this.userId, now, false);

    for (const candidate of candidates) {
      const normalizedCourse = normalizeTextKey(candidate.course);
      const normalizedTask = normalizeTextKey(candidate.task);

      const matchingDeadlines = existingDeadlines.filter(
        (deadline) =>
          normalizeTextKey(deadline.course) === normalizedCourse &&
          normalizeTextKey(deadline.task) === normalizedTask
      );

      const exactManaged = matchingDeadlines.find(
        (deadline) => deadline.sourceDueDate === candidate.sourceDueDate && isExamDeadline(deadline)
      );

      if (exactManaged) {
        const needsUpdate =
          exactManaged.course !== candidate.course ||
          exactManaged.task !== candidate.task ||
          exactManaged.priority !== candidate.priority;

        if (!needsUpdate) {
          result.skipped += 1;
          continue;
        }

        const updated = this.store.updateDeadline(this.userId, exactManaged.id, {
          course: candidate.course,
          task: candidate.task,
          priority: candidate.priority
        });
        if (updated) {
          const index = existingDeadlines.findIndex((deadline) => deadline.id === updated.id);
          if (index >= 0) {
            existingDeadlines[index] = updated;
          }
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      const managedSameTask = matchingDeadlines.find(
        (deadline) => Boolean(deadline.sourceDueDate) && isExamDeadline(deadline)
      );

      if (managedSameTask) {
        const existingSourceDueDate = managedSameTask.sourceDueDate ?? managedSameTask.dueDate;
        const userOverrodeDueDate =
          Boolean(managedSameTask.sourceDueDate) && managedSameTask.dueDate !== managedSameTask.sourceDueDate;
        const sourceDueDateChanged = existingSourceDueDate !== candidate.sourceDueDate;
        const nextDueDate = sourceDueDateChanged && !userOverrodeDueDate ? candidate.dueDate : managedSameTask.dueDate;

        const needsUpdate =
          managedSameTask.course !== candidate.course ||
          managedSameTask.task !== candidate.task ||
          managedSameTask.sourceDueDate !== candidate.sourceDueDate ||
          managedSameTask.dueDate !== nextDueDate ||
          managedSameTask.priority !== candidate.priority;

        if (!needsUpdate) {
          result.skipped += 1;
          continue;
        }

        const updated = this.store.updateDeadline(this.userId, managedSameTask.id, {
          course: candidate.course,
          task: candidate.task,
          dueDate: nextDueDate,
          sourceDueDate: candidate.sourceDueDate,
          priority: candidate.priority
        });
        if (updated) {
          const index = existingDeadlines.findIndex((deadline) => deadline.id === updated.id);
          if (index >= 0) {
            existingDeadlines[index] = updated;
          }
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      const hasManualSameTask = matchingDeadlines.some((deadline) => !deadline.sourceDueDate);
      if (hasManualSameTask) {
        result.skipped += 1;
        continue;
      }

      const created = this.store.createDeadline(this.userId, {
        course: candidate.course,
        task: candidate.task,
        dueDate: candidate.dueDate,
        sourceDueDate: candidate.sourceDueDate,
        priority: candidate.priority,
        completed: false
      });

      existingDeadlines.push(created);
      result.created += 1;
      result.createdDeadlines.push(created);
    }

    return result;
  }
}
