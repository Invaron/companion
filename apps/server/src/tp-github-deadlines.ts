import type { ImportedCalendarEvent } from "./calendar-import.js";
import { executeMcpToolCall, getMcpServers, type McpServerConfig, type McpToolBinding } from "./mcp.js";
import { RuntimeStore } from "./store.js";
import type { Deadline, Priority } from "./types.js";

export interface TpGithubDeadlineImportResult {
  attempted: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  courseCodes: string[];
  repositoriesScanned: string[];
}

interface ParsedReadmeDeadline {
  course: string;
  task: string;
  dueDate: string;
  sourceDueDate: string;
  priority: Priority;
}

interface GitHubRepositoryRef {
  owner: string;
  repo: string;
  fullName: string;
}

interface GitHubSearchRepositoryItem {
  name?: string;
  full_name?: string;
  owner?: {
    login?: string;
  };
}

interface AutoImportOptions {
  now?: Date;
  executeToolCall?: (binding: McpToolBinding, args: Record<string, unknown>) => Promise<unknown>;
}

const COURSE_CODE_REGEX = /\b[A-Z]{3}\d{3}\b/g;
const DOTTED_DATE_REGEX = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2})[.:](\d{2}))?/g;
const BOLD_SECTION_REGEX = /\*\*([^*]+)\*\*/g;
const DEADLINE_TASK_REGEX = /(assignment\s*\d+\s*(?:deadline)?|project\s*\+?\s*report(?:\s*due)?|project|exam|lab\s*\d+)/i;
const DEADLINE_SIGNAL_REGEX = /\b(deadline|due|assignment|project|report|exam|lab)\b/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTextKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCourseKey(value: string): string {
  const match = value.toUpperCase().match(COURSE_CODE_REGEX);
  return match?.[0] ?? value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeTaskLabel(value: string): string {
  const compact = value
    .replace(/[_*`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:,;]+$/g, "");
  if (!compact) {
    return "";
  }
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function toIsoFromDottedDateMatch(match: RegExpMatchArray): string | null {
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = match[4] !== undefined ? Number(match[4]) : 23;
  const minute = match[5] !== undefined ? Number(match[5]) : 59;
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  if (Number.isNaN(utc.getTime())) {
    return null;
  }
  return utc.toISOString();
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

function parseFirstJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with a fallback extraction.
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    const candidate = trimmed.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Ignore and return null.
    }
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const candidate = trimmed.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Ignore and return null.
    }
  }

  return null;
}

function isGithubMcpServer(server: McpServerConfig): boolean {
  return /github/i.test(server.label) || /github/i.test(server.serverUrl);
}

function serverAllowsTool(server: McpServerConfig, toolName: string): boolean {
  return server.toolAllowlist.length === 0 || server.toolAllowlist.includes(toolName);
}

function getMcpResultEnvelope(response: unknown): Record<string, unknown> | null {
  const payload = asRecord(response);
  if (!payload) {
    return null;
  }
  return asRecord(payload.result);
}

function getMcpResultText(response: unknown): string | null {
  const result = getMcpResultEnvelope(response);
  if (!result) {
    return null;
  }
  const resourceText = asNonEmptyString(result.resourceText);
  if (resourceText) {
    return resourceText;
  }
  const text = asNonEmptyString(result.text);
  return text ?? null;
}

function getMcpErrorMessage(response: unknown): string | null {
  const result = getMcpResultEnvelope(response);
  if (!result || result.isError !== true) {
    return null;
  }
  return asNonEmptyString(result.text) ?? "MCP tool call failed";
}

function selectRepository(courseCode: string, items: GitHubSearchRepositoryItem[]): GitHubRepositoryRef | null {
  const code = courseCode.toLowerCase();
  const scored = items
    .map((item) => {
      const repo = asNonEmptyString(item.name);
      const fullName = asNonEmptyString(item.full_name);
      const owner = asNonEmptyString(item.owner?.login);
      if (!repo || !owner || !fullName) {
        return null;
      }
      const fullNameLower = fullName.toLowerCase();
      const ownerLower = owner.toLowerCase();

      let score = 0;
      if (repo.toLowerCase() === "info") score += 10;
      if (fullNameLower.includes(`/${repo.toLowerCase()}`)) score += 1;
      if (fullNameLower.includes(`${code}-`)) score += 8;
      if (ownerLower.includes(code)) score += 6;
      if (fullNameLower.includes(code)) score += 4;
      if (/-(20\d{2})/.test(ownerLower)) score += 2;

      return {
        score,
        value: {
          owner,
          repo,
          fullName
        } satisfies GitHubRepositoryRef
      };
    })
    .filter((entry): entry is { score: number; value: GitHubRepositoryRef } => entry !== null)
    .sort((left, right) => right.score - left.score || left.value.fullName.localeCompare(right.value.fullName));

  return scored[0]?.value ?? null;
}

function upsertReadmeDeadline(
  byTaskKey: Map<string, ParsedReadmeDeadline>,
  next: ParsedReadmeDeadline
): void {
  const key = normalizeTextKey(next.task);
  if (!key) {
    return;
  }
  const existing = byTaskKey.get(key);
  if (!existing) {
    byTaskKey.set(key, next);
    return;
  }
  if (Date.parse(next.dueDate) >= Date.parse(existing.dueDate)) {
    byTaskKey.set(key, next);
  }
}

export function extractTPCourseCodes(events: ImportedCalendarEvent[]): string[] {
  const codes = new Set<string>();
  for (const event of events) {
    const matches = event.summary.toUpperCase().match(COURSE_CODE_REGEX) ?? [];
    matches.forEach((match) => codes.add(match));
  }
  return Array.from(codes).sort();
}

export function parseGitHubCourseDeadlinesFromReadme(
  markdown: string,
  courseCode: string,
  now: Date = new Date()
): ParsedReadmeDeadline[] {
  const byTaskKey = new Map<string, ParsedReadmeDeadline>();
  const lines = markdown.split(/\r?\n/);
  const nowMs = now.getTime();

  const pushCandidate = (rawTask: string | null, dueDateIso: string | null): void => {
    if (!rawTask || !dueDateIso) {
      return;
    }
    if (!DEADLINE_SIGNAL_REGEX.test(rawTask)) {
      return;
    }
    const normalizedTask = normalizeTaskLabel(rawTask);
    if (!normalizedTask) {
      return;
    }
    const dueMs = Date.parse(dueDateIso);
    if (!Number.isFinite(dueMs) || dueMs < nowMs) {
      return;
    }

    upsertReadmeDeadline(byTaskKey, {
      course: courseCode,
      task: normalizedTask,
      dueDate: dueDateIso,
      sourceDueDate: dueDateIso,
      priority: inferPriorityFromDueDate(dueDateIso, now)
    });
  };

  for (const line of lines) {
    if (/^\|.*\|$/.test(line) && line.includes("**")) {
      const dateMatches = Array.from(line.matchAll(DOTTED_DATE_REGEX));
      if (dateMatches.length > 0) {
        const dueDateIso = toIsoFromDottedDateMatch(dateMatches[0]);
        const boldMatches = Array.from(line.matchAll(BOLD_SECTION_REGEX));
        for (const bold of boldMatches) {
          pushCandidate(asNonEmptyString(bold[1]), dueDateIso);
        }
      }
      continue;
    }

    if (!/(deadline|due)/i.test(line)) {
      continue;
    }

    const dateMatches = Array.from(line.matchAll(DOTTED_DATE_REGEX));
    if (dateMatches.length === 0) {
      continue;
    }

    const dueDateIso = toIsoFromDottedDateMatch(dateMatches[dateMatches.length - 1]);
    const explicitTask = line.match(DEADLINE_TASK_REGEX)?.[0] ?? null;
    const boldTask = line.match(BOLD_SECTION_REGEX)?.[1] ?? null;
    pushCandidate(explicitTask ?? boldTask, dueDateIso);
  }

  return Array.from(byTaskKey.values()).sort((left, right) => Date.parse(left.dueDate) - Date.parse(right.dueDate));
}

function upsertImportedDeadline(
  store: RuntimeStore,
  userId: string,
  existingDeadlines: Deadline[],
  next: ParsedReadmeDeadline
): "imported" | "updated" | "skipped" {
  const nextCourse = normalizeCourseKey(next.course);
  const nextTask = normalizeTextKey(next.task);

  const exact = existingDeadlines.find(
    (deadline) =>
      normalizeCourseKey(deadline.course) === nextCourse &&
      normalizeTextKey(deadline.task) === nextTask &&
      deadline.dueDate === next.dueDate
  );
  if (exact) {
    return "skipped";
  }

  const sameTask = existingDeadlines.find(
    (deadline) =>
      normalizeCourseKey(deadline.course) === nextCourse &&
      normalizeTextKey(deadline.task) === nextTask
  );

  if (sameTask) {
    const managedBySource = Boolean(sameTask.sourceDueDate);
    const userOverrodeDueDate = managedBySource && sameTask.sourceDueDate !== sameTask.dueDate;

    if (!managedBySource || userOverrodeDueDate) {
      return "skipped";
    }

    const updated = store.updateDeadline(userId, sameTask.id, {
      dueDate: next.dueDate,
      sourceDueDate: next.sourceDueDate,
      priority: next.priority
    });
    if (!updated) {
      return "skipped";
    }

    const index = existingDeadlines.findIndex((deadline) => deadline.id === sameTask.id);
    if (index >= 0) {
      existingDeadlines[index] = updated;
    }
    return "updated";
  }

  const created = store.createDeadline(userId, {
    course: next.course,
    task: next.task,
    dueDate: next.dueDate,
    sourceDueDate: next.sourceDueDate,
    priority: next.priority,
    completed: false
  });
  existingDeadlines.push(created);
  return "imported";
}

async function findCourseRepository(
  server: McpServerConfig,
  courseCode: string,
  executeToolCall: (binding: McpToolBinding, args: Record<string, unknown>) => Promise<unknown>
): Promise<GitHubRepositoryRef | null> {
  if (!serverAllowsTool(server, "search_repositories")) {
    return null;
  }

  const binding: McpToolBinding = {
    server,
    remoteToolName: "search_repositories"
  };

  const collected = new Map<string, GitHubSearchRepositoryItem>();
  const queries = [`${courseCode.toLowerCase()} in:name`, `${courseCode} in:name`];

  for (const query of queries) {
    const response = await executeToolCall(binding, { query, sort: "updated" });
    const error = getMcpErrorMessage(response);
    if (error) {
      continue;
    }

    const text = getMcpResultText(response);
    if (!text) {
      continue;
    }

    const parsed = parseFirstJsonObject(text);
    const payload = asRecord(parsed);
    const items = Array.isArray(payload?.items) ? payload?.items : [];
    items.forEach((item) => {
      const record = asRecord(item);
      if (!record) {
        return;
      }
      const fullName = asNonEmptyString(record.full_name);
      if (!fullName) {
        return;
      }
      collected.set(fullName, {
        name: asNonEmptyString(record.name) ?? undefined,
        full_name: fullName,
        owner: asRecord(record.owner)
          ? {
              login: asNonEmptyString(asRecord(record.owner)?.login) ?? undefined
            }
          : undefined
      });
    });
  }

  return selectRepository(courseCode, Array.from(collected.values()));
}

async function fetchRepositoryReadme(
  server: McpServerConfig,
  repository: GitHubRepositoryRef,
  executeToolCall: (binding: McpToolBinding, args: Record<string, unknown>) => Promise<unknown>
): Promise<string | null> {
  if (!serverAllowsTool(server, "get_file_contents")) {
    return null;
  }

  const binding: McpToolBinding = {
    server,
    remoteToolName: "get_file_contents"
  };

  const response = await executeToolCall(binding, {
    owner: repository.owner,
    repo: repository.repo,
    path: "README.md"
  });
  const error = getMcpErrorMessage(response);
  if (error) {
    return null;
  }
  return getMcpResultText(response);
}

export async function autoImportTpGithubDeadlines(
  store: RuntimeStore,
  userId: string,
  tpEvents: ImportedCalendarEvent[],
  options: AutoImportOptions = {}
): Promise<TpGithubDeadlineImportResult> {
  const now = options.now ?? new Date();
  const executeToolCall = options.executeToolCall ?? executeMcpToolCall;
  const courseCodes = extractTPCourseCodes(tpEvents);

  if (courseCodes.length === 0) {
    return {
      attempted: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      courseCodes: [],
      repositoriesScanned: []
    };
  }

  const githubServers = getMcpServers(store, userId).filter((server) => server.enabled && isGithubMcpServer(server));
  if (githubServers.length === 0) {
    return {
      attempted: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      courseCodes,
      repositoriesScanned: []
    };
  }

  const existingDeadlines = store.getDeadlines(userId, now, false);
  const repositoriesScanned: string[] = [];
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const courseCode of courseCodes) {
    let courseHandled = false;

    for (const server of githubServers) {
      try {
        const repository = await findCourseRepository(server, courseCode, executeToolCall);
        if (!repository) {
          continue;
        }

        repositoriesScanned.push(repository.fullName);
        const readme = await fetchRepositoryReadme(server, repository, executeToolCall);
        if (!readme) {
          continue;
        }

        const parsedDeadlines = parseGitHubCourseDeadlinesFromReadme(readme, courseCode, now);
        parsedDeadlines.forEach((deadline) => {
          const outcome = upsertImportedDeadline(store, userId, existingDeadlines, deadline);
          if (outcome === "imported") {
            imported += 1;
          } else if (outcome === "updated") {
            updated += 1;
          } else {
            skipped += 1;
          }
        });

        courseHandled = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${courseCode}: ${message}`);
      }
    }

    if (!courseHandled) {
      errors.push(`${courseCode}: no matching GitHub repository/README found`);
    }
  }

  return {
    attempted: true,
    imported,
    updated,
    skipped,
    errors,
    courseCodes,
    repositoriesScanned: Array.from(new Set(repositoriesScanned))
  };
}
