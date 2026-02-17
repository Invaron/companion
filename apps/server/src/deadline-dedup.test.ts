import { describe, expect, it } from "vitest";
import { buildDeadlineDedupResult, generateDeadlineMergeSuggestions } from "./deadline-dedup.js";
import type { Deadline } from "./types.js";

function makeDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: overrides.id ?? "deadline-1",
    course: overrides.course ?? "DAT560",
    task: overrides.task ?? "Assignment 1",
    dueDate: overrides.dueDate ?? "2026-03-20T23:59:00.000Z",
    priority: overrides.priority ?? "medium",
    completed: overrides.completed ?? false,
    canvasAssignmentId: overrides.canvasAssignmentId
  };
}

describe("deadline-dedup", () => {
  it("detects cross-source duplicates and selects manual as canonical", () => {
    const manual = makeDeadline({
      id: "deadline-manual-1",
      course: "DAT560",
      task: "Assignment 3 Report",
      dueDate: "2026-03-20T23:59:00.000Z",
      priority: "high"
    });
    const canvas = makeDeadline({
      id: "deadline-canvas-1",
      course: "DAT560-1",
      task: "Assignment 3: report",
      dueDate: "2026-03-20T22:00:00.000Z",
      priority: "medium",
      canvasAssignmentId: 9001
    });
    const github = makeDeadline({
      id: "github-dat560-assignment-3-report",
      course: "DAT560",
      task: "Assignment 3 report",
      dueDate: "2026-03-21T00:30:00.000Z",
      priority: "low"
    });

    const result = buildDeadlineDedupResult([manual, canvas, github], new Date("2026-02-17T12:00:00.000Z"));

    expect(result.duplicateGroups).toBe(1);
    expect(result.totalDeadlines).toBe(3);
    expect(result.generatedAt).toBe("2026-02-17T12:00:00.000Z");

    const suggestion = result.suggestions[0];
    expect(suggestion?.canonicalId).toBe("deadline-manual-1");
    expect(suggestion?.canonicalSource).toBe("manual");
    expect(suggestion?.duplicateIds.sort()).toEqual(["deadline-canvas-1", "github-dat560-assignment-3-report"]);
    expect(suggestion?.confidence).toBe("high");
    expect(suggestion?.mergedPreview.priority).toBe("high");
  });

  it("prefers Canvas as canonical when manual record is absent", () => {
    const canvas = makeDeadline({
      id: "deadline-canvas-42",
      course: "DAT520-1",
      task: "Lab 2 UDP",
      dueDate: "2026-04-10T23:59:00.000Z",
      priority: "high",
      canvasAssignmentId: 42
    });
    const github = makeDeadline({
      id: "github-dat520-lab-2-udp",
      course: "DAT520",
      task: "Lab 2 UDP",
      dueDate: "2026-04-11T00:30:00.000Z",
      priority: "medium"
    });

    const suggestions = generateDeadlineMergeSuggestions([canvas, github]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.canonicalId).toBe("deadline-canvas-42");
    expect(suggestions[0]?.canonicalSource).toBe("canvas");
  });

  it("does not flag unrelated deadlines as duplicates", () => {
    const a = makeDeadline({
      id: "manual-a",
      course: "DAT560",
      task: "Assignment 1",
      dueDate: "2026-03-01T23:59:00.000Z"
    });
    const b = makeDeadline({
      id: "manual-b",
      course: "DAT560",
      task: "Assignment 1",
      dueDate: "2026-03-15T23:59:00.000Z"
    });
    const c = makeDeadline({
      id: "manual-c",
      course: "DAT520",
      task: "Assignment 1",
      dueDate: "2026-03-01T23:59:00.000Z"
    });

    const suggestions = generateDeadlineMergeSuggestions([a, b, c]);
    expect(suggestions).toHaveLength(0);
  });

  it("keeps merged preview completion if any duplicate is already completed", () => {
    const manual = makeDeadline({
      id: "deadline-manual-2",
      course: "DAT600",
      task: "Project proposal",
      dueDate: "2026-04-05T23:59:00.000Z",
      completed: false
    });
    const canvasCompleted = makeDeadline({
      id: "deadline-canvas-2",
      course: "DAT600-1",
      task: "Project proposal",
      dueDate: "2026-04-06T00:15:00.000Z",
      completed: true,
      canvasAssignmentId: 3002
    });

    const suggestions = generateDeadlineMergeSuggestions([manual, canvasCompleted]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.mergedPreview.completed).toBe(true);
  });
});
