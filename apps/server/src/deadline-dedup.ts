import type { Deadline, Priority } from "./types.js";

export type DeadlineSource = "manual" | "canvas" | "github";
export type MergeConfidence = "high" | "medium";

export interface DedupDeadlineMember extends Deadline {
  source: DeadlineSource;
}

export interface MergePreview {
  course: string;
  task: string;
  dueDate: string;
  priority: Priority;
  completed: boolean;
}

export interface DeadlineMergeSuggestion {
  canonicalId: string;
  canonicalSource: DeadlineSource;
  duplicateIds: string[];
  confidence: MergeConfidence;
  score: number;
  reason: string;
  mergedPreview: MergePreview;
  members: DedupDeadlineMember[];
}

export interface DeadlineDedupResult {
  generatedAt: string;
  totalDeadlines: number;
  duplicateGroups: number;
  suggestions: DeadlineMergeSuggestion[];
}

interface DuplicateSignal {
  isDuplicate: boolean;
  score: number;
  taskScore: number;
  dueDistanceDays: number;
  courseKey: string;
}

const STOP_WORDS = new Set([
  "assignment",
  "assignments",
  "lab",
  "project",
  "task",
  "due",
  "submission",
  "report",
  "part",
  "week"
]);

const PRIORITY_RANK: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const SOURCE_RANK: Record<DeadlineSource, number> = {
  github: 1,
  canvas: 2,
  manual: 3
};

export function inferDeadlineSource(deadline: Deadline): DeadlineSource {
  if (typeof deadline.canvasAssignmentId === "number") {
    return "canvas";
  }
  if (deadline.id.startsWith("github-")) {
    return "github";
  }
  return "manual";
}

function normalizeCourseKey(course: string): string {
  const upper = course.toUpperCase();
  const codeMatch = upper.match(/[A-Z]{3}\d{3}/);
  if (codeMatch) {
    return codeMatch[0];
  }
  return upper.replace(/[^A-Z0-9]/g, "");
}

function normalizeTask(task: string): string {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTask(task: string): string[] {
  return normalizeTask(task)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function jaccardSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = leftSet.size + rightSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function taskSimilarity(leftTask: string, rightTask: string): number {
  const left = normalizeTask(leftTask);
  const right = normalizeTask(rightTask);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if ((left.includes(right) || right.includes(left)) && Math.min(left.length, right.length) >= 8) {
    return 0.9;
  }

  return jaccardSimilarity(tokenizeTask(left), tokenizeTask(right));
}

function dueDateDistanceDays(leftDueDate: string, rightDueDate: string): number {
  const left = new Date(leftDueDate);
  const right = new Date(rightDueDate);

  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
}

function evaluateDuplicateSignal(left: Deadline, right: Deadline): DuplicateSignal {
  const leftCourse = normalizeCourseKey(left.course);
  const rightCourse = normalizeCourseKey(right.course);

  if (!leftCourse || !rightCourse || leftCourse !== rightCourse) {
    return {
      isDuplicate: false,
      score: 0,
      taskScore: 0,
      dueDistanceDays: Number.POSITIVE_INFINITY,
      courseKey: leftCourse || rightCourse
    };
  }

  const dueDistanceDays = dueDateDistanceDays(left.dueDate, right.dueDate);
  if (!Number.isFinite(dueDistanceDays) || dueDistanceDays > 2) {
    return {
      isDuplicate: false,
      score: 0,
      taskScore: 0,
      dueDistanceDays,
      courseKey: leftCourse
    };
  }

  const taskScore = taskSimilarity(left.task, right.task);
  const dueScore = Math.max(0, 1 - dueDistanceDays / 2);
  const score = taskScore * 0.7 + dueScore * 0.3;

  return {
    isDuplicate: taskScore >= 0.45 && score >= 0.58,
    score,
    taskScore,
    dueDistanceDays,
    courseKey: leftCourse
  };
}

function find(parent: number[], value: number): number {
  if (parent[value] === value) {
    return value;
  }
  parent[value] = find(parent, parent[value] ?? value);
  return parent[value] ?? value;
}

function union(parent: number[], left: number, right: number): void {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) {
    parent[rightRoot] = leftRoot;
  }
}

function compareCanonicalCandidates(left: DedupDeadlineMember, right: DedupDeadlineMember): number {
  if (left.completed !== right.completed) {
    return left.completed ? -1 : 1;
  }

  const sourceDiff = SOURCE_RANK[right.source] - SOURCE_RANK[left.source];
  if (sourceDiff !== 0) {
    return sourceDiff;
  }

  const priorityDiff = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const dueDiff = new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
  if (Number.isFinite(dueDiff) && dueDiff !== 0) {
    return dueDiff;
  }

  return left.id.localeCompare(right.id);
}

function highestPriority(deadlines: DedupDeadlineMember[]): Priority {
  return deadlines.reduce((current, deadline) =>
    PRIORITY_RANK[deadline.priority] > PRIORITY_RANK[current] ? deadline.priority : current, "low" as Priority
  );
}

function earliestDueDate(deadlines: DedupDeadlineMember[], fallback: string): string {
  const valid = deadlines
    .map((deadline) => deadline.dueDate)
    .filter((dueDate) => Number.isFinite(new Date(dueDate).getTime()))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  return valid[0] ?? fallback;
}

function buildReason(courseKey: string, members: DedupDeadlineMember[], maxDueDistanceDays: number): string {
  const withinWindow =
    maxDueDistanceDays < 0.25 ? "same due day" : `due dates within ${Math.ceil(maxDueDistanceDays)} day(s)`;
  return `${members.length} deadlines appear duplicated for ${courseKey}; tasks are textually similar with ${withinWindow}.`;
}

export function generateDeadlineMergeSuggestions(deadlines: Deadline[]): DeadlineMergeSuggestion[] {
  if (deadlines.length < 2) {
    return [];
  }

  const members = deadlines.map((deadline) => ({
    ...deadline,
    source: inferDeadlineSource(deadline)
  }));

  const parent = members.map((_value, index) => index);

  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const signal = evaluateDuplicateSignal(members[i] as Deadline, members[j] as Deadline);
      if (signal.isDuplicate) {
        union(parent, i, j);
      }
    }
  }

  const groups = new Map<number, DedupDeadlineMember[]>();
  for (let index = 0; index < members.length; index += 1) {
    const root = find(parent, index);
    const existing = groups.get(root) ?? [];
    existing.push(members[index] as DedupDeadlineMember);
    groups.set(root, existing);
  }

  const suggestions: DeadlineMergeSuggestion[] = [];

  for (const groupMembers of groups.values()) {
    if (groupMembers.length < 2) {
      continue;
    }

    const sorted = [...groupMembers].sort(compareCanonicalCandidates);
    const canonical = sorted[0] as DedupDeadlineMember;
    const duplicates = sorted.slice(1);

    const pairSignals = duplicates.map((member) => evaluateDuplicateSignal(canonical, member));
    const averageScore =
      pairSignals.reduce((sum, signal) => sum + signal.score, 0) / Math.max(1, pairSignals.length);
    const maxDueDistanceDays = pairSignals.reduce(
      (max, signal) => (signal.dueDistanceDays > max ? signal.dueDistanceDays : max),
      0
    );

    const mergedPreview: MergePreview = {
      course: canonical.course,
      task: canonical.task,
      dueDate: earliestDueDate(sorted, canonical.dueDate),
      priority: highestPriority(sorted),
      completed: sorted.some((deadline) => deadline.completed)
    };

    suggestions.push({
      canonicalId: canonical.id,
      canonicalSource: canonical.source,
      duplicateIds: duplicates.map((deadline) => deadline.id),
      confidence: averageScore >= 0.8 ? "high" : "medium",
      score: Number(averageScore.toFixed(3)),
      reason: buildReason(normalizeCourseKey(canonical.course), sorted, maxDueDistanceDays),
      mergedPreview,
      members: sorted
    });
  }

  return suggestions.sort((left, right) => {
    if (left.confidence !== right.confidence) {
      return left.confidence === "high" ? -1 : 1;
    }
    if (right.duplicateIds.length !== left.duplicateIds.length) {
      return right.duplicateIds.length - left.duplicateIds.length;
    }
    return right.score - left.score;
  });
}

export function buildDeadlineDedupResult(
  deadlines: Deadline[],
  generatedAt: Date = new Date()
): DeadlineDedupResult {
  const suggestions = generateDeadlineMergeSuggestions(deadlines);
  return {
    generatedAt: generatedAt.toISOString(),
    totalDeadlines: deadlines.length,
    duplicateGroups: suggestions.length,
    suggestions
  };
}
