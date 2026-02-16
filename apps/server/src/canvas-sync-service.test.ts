import { describe, expect, it, beforeEach, vi } from "vitest";
import { CanvasSyncService } from "./canvas-sync-service.js";
import { RuntimeStore } from "./store.js";
import * as canvasSync from "./canvas-sync.js";

// Mock the canvas-sync module
vi.mock("./canvas-sync.js", () => ({
  fetchAllCanvasData: vi.fn(),
}));

describe("Canvas sync service", () => {
  let store: RuntimeStore;
  let service: CanvasSyncService;

  beforeEach(() => {
    store = new RuntimeStore(":memory:");
    service = new CanvasSyncService(store);
  });

  it("initializes without crashing", () => {
    expect(service).toBeDefined();
    expect(service.isCurrentlySyncing()).toBe(false);
  });

  it("stores Canvas data successfully", async () => {
    const mockData = {
      courses: [
        {
          id: "1",
          name: "DAT520 Distributed Systems",
          courseCode: "DAT520",
          createdAt: new Date().toISOString(),
        },
      ],
      assignments: [
        {
          id: "1",
          courseId: "1",
          name: "Lab 1: MapReduce",
          description: "Implement MapReduce",
          dueAt: "2026-03-15T23:59:00.000Z",
          pointsPossible: 100,
          submissionTypes: ["online_upload"],
          hasSubmittedSubmissions: false,
          gradingType: "points",
          createdAt: new Date().toISOString(),
        },
      ],
      modules: [
        {
          id: "1",
          courseId: "1",
          name: "Week 1: Introduction",
          position: 1,
          requireSequentialProgress: false,
          state: "active",
          createdAt: new Date().toISOString(),
        },
      ],
      announcements: [
        {
          id: "1",
          courseId: "1",
          title: "Welcome to DAT520",
          message: "Welcome message",
          postedAt: new Date().toISOString(),
          author: "Professor",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    vi.mocked(canvasSync.fetchAllCanvasData).mockResolvedValue(mockData);

    const result = await service.sync();

    expect(result.success).toBe(true);
    expect(result.coursesProcessed).toBe(1);
    expect(result.assignmentsProcessed).toBe(1);
    expect(result.modulesProcessed).toBe(1);
    expect(result.announcementsProcessed).toBe(1);

    // Verify data was stored
    const courses = store.getCanvasCourses();
    expect(courses).toHaveLength(1);
    expect(courses[0].name).toBe("DAT520 Distributed Systems");

    const assignments = store.getCanvasAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].name).toBe("Lab 1: MapReduce");

    const modules = store.getCanvasModules();
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe("Week 1: Introduction");

    const announcements = store.getCanvasAnnouncements();
    expect(announcements).toHaveLength(1);
    expect(announcements[0].title).toBe("Welcome to DAT520");
  });

  it("handles sync errors gracefully", async () => {
    vi.mocked(canvasSync.fetchAllCanvasData).mockRejectedValue(new Error("Network error"));

    const result = await service.sync();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
    expect(result.coursesProcessed).toBe(0);
  });

  it("prevents concurrent syncs", async () => {
    const mockData = {
      courses: [],
      assignments: [],
      modules: [],
      announcements: [],
    };

    vi.mocked(canvasSync.fetchAllCanvasData).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockData), 100))
    );

    const sync1 = service.sync();
    const sync2 = service.sync();

    const [result1, result2] = await Promise.all([sync1, sync2]);

    expect(result1.success || result2.success).toBe(true);
    expect(!result1.success || !result2.success).toBe(true);
    expect(result1.error === "Sync already in progress" || result2.error === "Sync already in progress").toBe(true);
  });
});
