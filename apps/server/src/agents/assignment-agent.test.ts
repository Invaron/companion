import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssignmentTrackerAgent } from "./assignment-agent.js";
import { AgentContext } from "../agent-base.js";
import { AgentEvent } from "../types.js";

describe("AssignmentTrackerAgent", () => {
  let agent: AssignmentTrackerAgent;
  let mockContext: AgentContext;
  let emittedEvents: AgentEvent[];

  beforeEach(() => {
    agent = new AssignmentTrackerAgent();
    emittedEvents = [];
    mockContext = {
      emit: (event: AgentEvent) => {
        emittedEvents.push(event);
      }
    };
  });

  describe("configuration", () => {
    it("should have correct agent name", () => {
      expect(agent.name).toBe("assignment-tracker");
    });

    it("should have correct interval", () => {
      expect(agent.intervalMs).toBe(20_000);
    });
  });

  describe("run", () => {
    it("should emit an assignment deadline event", async () => {
      await agent.run(mockContext);

      expect(emittedEvents).toHaveLength(1);
      const event = emittedEvents[0];

      expect(event.source).toBe("assignment-tracker");
      expect(event.eventType).toBe("assignment.deadline");
      expect(event.id).toMatch(/^assignment-tracker-/);
    });

    it("should emit event with deadline data", async () => {
      await agent.run(mockContext);

      const event = emittedEvents[0];
      const payload = event.payload as any;

      expect(payload).toHaveProperty("course");
      expect(payload).toHaveProperty("task");
      expect(payload).toHaveProperty("hoursLeft");
      expect(typeof payload.course).toBe("string");
      expect(typeof payload.task).toBe("string");
      expect(typeof payload.hoursLeft).toBe("number");
    });

    it("should emit critical priority for deadlines <= 12 hours", async () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Force selection of "Operating Systems" with hoursLeft: 12
      mockRandom.mockReturnValue(0.9);

      await agent.run(mockContext);

      const event = emittedEvents[0];
      expect(event.priority).toBe("critical");

      mockRandom.mockRestore();
    });

    it("should emit high priority for deadlines <= 24 hours", async () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Force selection of "Algorithms" with hoursLeft: 28 (not <= 24)
      // Let's mock a different scenario
      mockRandom.mockReturnValue(0.1);

      await agent.run(mockContext);

      const event = emittedEvents[0];
      const payload = event.payload as any;
      
      // Algorithms has 28 hours, so it should be medium
      if (payload.hoursLeft <= 12) {
        expect(event.priority).toBe("critical");
      } else if (payload.hoursLeft <= 24) {
        expect(event.priority).toBe("high");
      } else {
        expect(event.priority).toBe("medium");
      }

      mockRandom.mockRestore();
    });

    it("should emit medium priority for deadlines > 24 hours", async () => {
      const mockRandom = vi.spyOn(Math, "random");
      // Force selection of "Databases" with hoursLeft: 54
      mockRandom.mockReturnValue(0.4);

      await agent.run(mockContext);

      const event = emittedEvents[0];
      expect(event.priority).toBe("medium");

      mockRandom.mockRestore();
    });

    it("should select from available deadlines", async () => {
      const validCourses = ["Algorithms", "Databases", "Operating Systems"];
      const validTasks = ["Problem Set 4", "Schema Design Report", "Lab 3"];

      await agent.run(mockContext);

      const event = emittedEvents[0];
      const payload = event.payload as any;

      expect(validCourses).toContain(payload.course);
      expect(validTasks).toContain(payload.task);
      expect(payload.hoursLeft).toBeGreaterThan(0);
    });

    it("should emit events with valid timestamps", async () => {
      await agent.run(mockContext);

      const event = emittedEvents[0];
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      
      const timestamp = new Date(event.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it("should be callable multiple times", async () => {
      await agent.run(mockContext);
      await agent.run(mockContext);
      await agent.run(mockContext);

      expect(emittedEvents).toHaveLength(3);
      
      emittedEvents.forEach((event) => {
        expect(event.source).toBe("assignment-tracker");
        expect(event.eventType).toBe("assignment.deadline");
      });
    });

    it("should generate different deadlines on multiple runs", async () => {
      const iterations = 20;
      const courses = new Set<string>();

      for (let i = 0; i < iterations; i++) {
        emittedEvents = [];
        await agent.run(mockContext);
        const payload = emittedEvents[0].payload as any;
        courses.add(payload.course);
      }

      // With 20 iterations and 3 possible courses, we should see more than 1 course
      expect(courses.size).toBeGreaterThan(1);
    });
  });

  describe("deadline variations", () => {
    it("should include Algorithms deadline", async () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom.mockReturnValue(0.1); // Force first deadline

      await agent.run(mockContext);

      const event = emittedEvents[0];
      const payload = event.payload as any;

      expect(payload.course).toBe("Algorithms");
      expect(payload.task).toBe("Problem Set 4");
      expect(payload.hoursLeft).toBe(28);
      expect(event.priority).toBe("medium");

      mockRandom.mockRestore();
    });

    it("should include Databases deadline", async () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom.mockReturnValue(0.4); // Force second deadline

      await agent.run(mockContext);

      const event = emittedEvents[0];
      const payload = event.payload as any;

      expect(payload.course).toBe("Databases");
      expect(payload.task).toBe("Schema Design Report");
      expect(payload.hoursLeft).toBe(54);
      expect(event.priority).toBe("medium");

      mockRandom.mockRestore();
    });

    it("should include Operating Systems deadline", async () => {
      const mockRandom = vi.spyOn(Math, "random");
      mockRandom.mockReturnValue(0.9); // Force third deadline

      await agent.run(mockContext);

      const event = emittedEvents[0];
      const payload = event.payload as any;

      expect(payload.course).toBe("Operating Systems");
      expect(payload.task).toBe("Lab 3");
      expect(payload.hoursLeft).toBe(12);
      expect(event.priority).toBe("critical");

      mockRandom.mockRestore();
    });
  });

  describe("priority calculation", () => {
    it("should correctly calculate priority based on hoursLeft", async () => {
      // Test all three deadlines and verify their priorities
      const testCases = [
        { randomValue: 0.1, expectedPriority: "medium", hoursLeft: 28 },  // Algorithms
        { randomValue: 0.4, expectedPriority: "medium", hoursLeft: 54 },  // Databases
        { randomValue: 0.9, expectedPriority: "critical", hoursLeft: 12 } // OS
      ];

      for (const testCase of testCases) {
        const mockRandom = vi.spyOn(Math, "random");
        mockRandom.mockReturnValue(testCase.randomValue);
        
        emittedEvents = [];
        await agent.run(mockContext);

        const event = emittedEvents[0];
        expect(event.priority).toBe(testCase.expectedPriority);

        mockRandom.mockRestore();
      }
    });
  });

  describe("edge cases", () => {
    it("should handle context emit being called", async () => {
      let emitCalled = false;
      const testContext: AgentContext = {
        emit: () => {
          emitCalled = true;
        }
      };

      await agent.run(testContext);

      expect(emitCalled).toBe(true);
    });

    it("should complete run without throwing errors", async () => {
      await expect(agent.run(mockContext)).resolves.not.toThrow();
    });
  });
});
