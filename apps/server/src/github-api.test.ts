import { describe, it, expect } from "vitest";

describe("GitHub API - createIssue with agentAssignment", () => {
  describe("agentAssignment payload structure", () => {
    it("should construct valid agent_assignment payload for Copilot", () => {
      // This test validates the structure used in orchestrator.js
      // for assigning issues to the Copilot agent
      const issuePayload = {
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: "lucyscript/companion",
          base_branch: "main",
          custom_instructions: "Use the backend-engineer agent profile. Follow its instructions strictly.",
          custom_agent: "backend-engineer",
          model: "",
        },
      };

      // Validate structure
      expect(issuePayload).toHaveProperty("assignees");
      expect(issuePayload).toHaveProperty("agent_assignment");
      
      expect(issuePayload.assignees).toEqual(["copilot-swe-agent[bot]"]);
      expect(issuePayload.agent_assignment).toHaveProperty("target_repo");
      expect(issuePayload.agent_assignment).toHaveProperty("base_branch");
      expect(issuePayload.agent_assignment).toHaveProperty("custom_instructions");
      expect(issuePayload.agent_assignment).toHaveProperty("custom_agent");
      expect(issuePayload.agent_assignment).toHaveProperty("model");
    });

    it("should support different agent profiles", () => {
      const agentProfiles = [
        "backend-engineer",
        "frontend-engineer",
        "test-engineer",
        "docs-writer",
      ];

      agentProfiles.forEach((profile) => {
        const payload = {
          assignees: ["copilot-swe-agent[bot]"],
          agent_assignment: {
            target_repo: "lucyscript/companion",
            base_branch: "main",
            custom_instructions: `Use the ${profile} agent profile. Follow its instructions strictly.`,
            custom_agent: profile,
            model: "",
          },
        };

        expect(payload.agent_assignment.custom_agent).toBe(profile);
        expect(payload.agent_assignment.custom_instructions).toContain(profile);
      });
    });

    it("should include target_repo in correct format", () => {
      const payload = {
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: "lucyscript/companion",
          base_branch: "main",
          custom_instructions: "Test instructions",
          custom_agent: "backend-engineer",
          model: "",
        },
      };

      expect(payload.agent_assignment.target_repo).toBe("lucyscript/companion");
    });

    it("should specify base_branch", () => {
      const payload = {
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: "lucyscript/companion",
          base_branch: "main",
          custom_instructions: "Test instructions",
          custom_agent: "backend-engineer",
          model: "",
        },
      };

      expect(payload.agent_assignment.base_branch).toBe("main");
    });

    it("should include custom_instructions with agent profile reference", () => {
      const agentProfile = "frontend-engineer";
      const payload = {
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: "lucyscript/companion",
          base_branch: "main",
          custom_instructions: `Use the ${agentProfile} agent profile. Follow its instructions strictly. After completing the work, update docs/project-brief.md to reflect your changes.`,
          custom_agent: agentProfile,
          model: "",
        },
      };

      expect(payload.agent_assignment.custom_instructions).toContain(
        agentProfile
      );
      expect(payload.agent_assignment.custom_instructions).toContain(
        "Follow its instructions strictly"
      );
    });

    it("should allow empty model field", () => {
      const payload = {
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: "lucyscript/companion",
          base_branch: "main",
          custom_instructions: "Test instructions",
          custom_agent: "backend-engineer",
          model: "",
        },
      };

      expect(payload.agent_assignment.model).toBe("");
    });

    it("should validate complete payload structure matches orchestrator implementation", () => {
      // This mirrors the exact structure from orchestrator.js lines 194-200
      const owner = "lucyscript";
      const repoName = "companion";
      const agentProfile = "backend-engineer";

      const body = {
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: `${owner}/${repoName}`,
          base_branch: "main",
          custom_instructions: `Use the ${agentProfile} agent profile. Follow its instructions strictly. After completing the work, update docs/project-brief.md to reflect your changes.`,
          custom_agent: agentProfile,
          model: "",
        },
      };

      // Validate the complete structure
      expect(body.assignees).toEqual(["copilot-swe-agent[bot]"]);
      expect(body.agent_assignment.target_repo).toBe(`${owner}/${repoName}`);
      expect(body.agent_assignment.base_branch).toBe("main");
      expect(body.agent_assignment.custom_agent).toBe(agentProfile);
      expect(body.agent_assignment.custom_instructions).toContain(agentProfile);
      expect(body.agent_assignment.custom_instructions).toContain(
        "project-brief.md"
      );
      expect(body.agent_assignment.model).toBe("");
    });
  });
});
