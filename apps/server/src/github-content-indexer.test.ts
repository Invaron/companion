import { describe, it, expect } from "vitest";
import {
  classifyDocument,
  extractMetadata,
  buildIndexedDocument
} from "./github-content-indexer.js";

describe("classifyDocument", () => {
  it("classifies assignment by path", () => {
    expect(classifyDocument("assignments/lab3/README.md", "# Lab 3")).toBe("assignment");
    expect(classifyDocument("lab1/main.go", "package main")).toBe("assignment");
    expect(classifyDocument("oblig2-spec.md", "# Oblig 2")).toBe("assignment");
  });

  it("classifies exam by path", () => {
    expect(classifyDocument("exam-info.md", "# Exam")).toBe("exam-info");
    expect(classifyDocument("exam/past-exams.md", "# Past")).toBe("exam-info");
  });

  it("classifies syllabus by path", () => {
    expect(classifyDocument("syllabus.md", "# Course")).toBe("syllabus");
    expect(classifyDocument("course-info.md", "# Info")).toBe("syllabus");
  });

  it("classifies by heading when path is generic", () => {
    expect(classifyDocument("info.md", "# Lab Assignment 3\nDo this and that.")).toBe("assignment");
    expect(classifyDocument("info.md", "# Exam Information\nDate: June")).toBe("exam-info");
    expect(classifyDocument("info.md", "# Course Overview\nThis course covers...")).toBe("syllabus");
    expect(classifyDocument("spec.md", "# Project Description\nBuild a system")).toBe("project-spec");
  });

  it("classifies by deadline table presence", () => {
    const mdWithTable = "# Schedule\n\n| Lab | Deadline |\n|-----|----------|\n| 1 | Jan 15 |\n";
    expect(classifyDocument("schedule.md", mdWithTable)).toBe("assignment");
  });

  it("falls back to general-info for root README", () => {
    expect(classifyDocument("README.md", "# Hello")).toBe("general-info");
  });

  it("falls back to other for unknown files", () => {
    expect(classifyDocument("notes/random.md", "Some content without keywords")).toBe("other");
  });
});

describe("extractMetadata", () => {
  it("extracts assignment metadata", () => {
    const md = `# Lab 3: Distributed Consensus

**Deadline**: 2026-02-28

This is an individual assignment.

## Requirements
- Implement Raft consensus
- Write unit tests
- Handle leader election
- Support log replication

Grading weight: 15%
Submit via QuickFeed.
`;
    const result = extractMetadata("assignment", md);
    expect(result.type).toBe("assignment");
    if (result.type === "assignment") {
      expect(result.data.deadline).toBe("2026-02-28");
      expect(result.data.labNumber).toBe(3);
      expect(result.data.groupOrIndividual).toBe("individual");
      expect(result.data.requirements.length).toBeGreaterThan(0);
      expect(result.data.requirements[0]).toContain("Implement Raft");
      expect(result.data.gradingWeight).toBe("15%");
    }
  });

  it("extracts group assignment metadata", () => {
    const md = "# Team Project\n\nWork in groups of 2-3.";
    const result = extractMetadata("assignment", md);
    if (result.type === "assignment") {
      expect(result.data.groupOrIndividual).toBe("group");
    }
  });

  it("extracts syllabus metadata", () => {
    const md = `# DAT520 Distributed Systems

10 ECTS credits

Lecturer: John Smith

## Grading
- 60% portfolio
- 40% exam

## Reading
- Distributed Systems by Tanenbaum
- Go Programming Language
`;
    const result = extractMetadata("syllabus", md);
    expect(result.type).toBe("syllabus");
    if (result.type === "syllabus") {
      expect(result.data.courseName).toContain("DAT520");
      expect(result.data.credits).toBe("10 credits");
      expect(result.data.lecturer).toBe("John Smith");
      expect(result.data.gradingBreakdown.length).toBeGreaterThan(0);
      expect(result.data.readingList.length).toBeGreaterThan(0);
    }
  });

  it("extracts exam metadata", () => {
    const md = `# Exam Information

Date: 15.06.2026
Duration: 4 hours
Format: written

## Allowed Aids
- One A4 sheet of notes
- Calculator
`;
    const result = extractMetadata("exam-info", md);
    expect(result.type).toBe("exam-info");
    if (result.type === "exam-info") {
      expect(result.data.date).toBeDefined();
      expect(result.data.duration).toBe("4 hours");
      expect(result.data.format).toBe("written");
      expect(result.data.allowedAids).toContain("One A4 sheet of notes");
      expect(result.data.allowedAids).toContain("Calculator");
    }
  });

  it("extracts project metadata", () => {
    const md = `# Semester Project

Team size: 3-4 students

Build a distributed key-value store using Go and Docker.

## Milestones
1. Design document (Feb 15)
2. Prototype (Mar 1)
3. Final submission (Apr 15)

## Deliverables
- Source code
- Report
- Presentation
`;
    const result = extractMetadata("project-spec", md);
    expect(result.type).toBe("project-spec");
    if (result.type === "project-spec") {
      expect(result.data.teamSize).toContain("3-4");
      expect(result.data.milestones.length).toBe(3);
      expect(result.data.deliverables.length).toBe(3);
      expect(result.data.technologies).toContain("go");
      expect(result.data.technologies).toContain("docker");
    }
  });

  it("returns general metadata for other types", () => {
    const result = extractMetadata("other", "# Random content");
    expect(result.type).toBe("general");
  });
});

describe("buildIndexedDocument", () => {
  it("builds a complete indexed document", () => {
    const md = "# Lab 1: Getting Started\n\nDeadline: 2026-01-20\n\nSet up your Go environment.";
    const doc = buildIndexedDocument(
      "DAT520", "dat520-2026", "assignments", "lab1/README.md",
      md, "abc123sha", "2026-02-21T12:00:00Z"
    );

    expect(doc.id).toMatch(/^github-doc-dat520-/);
    expect(doc.courseCode).toBe("DAT520");
    expect(doc.docType).toBe("assignment");
    expect(doc.title).toContain("Lab 1");
    expect(doc.blobSha).toBe("abc123sha");
    expect(doc.url).toContain("github.com/dat520-2026/assignments");
    expect(doc.metadata.type).toBe("assignment");
  });

  it("classifies README.md as general-info", () => {
    const doc = buildIndexedDocument(
      "DAT520", "dat520-2026", "info", "README.md",
      "# DAT520 Course", "sha1", "2026-02-21T12:00:00Z"
    );
    expect(doc.docType).toBe("general-info");
  });
});
