import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssignmentTrackerAgent } from "./assignment-agent.js";
import { AgentContext } from "../agent-base.js";
import { AgentEvent } from "../types.js";

describe("AssignmentTrackerAgent - Basic Functionality", () => {
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
});
