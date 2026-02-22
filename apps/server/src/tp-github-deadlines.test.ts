import { describe, expect, it } from "vitest";
import type { McpToolBinding } from "./mcp.js";
import { upsertMcpServer } from "./mcp.js";
import { RuntimeStore } from "./store.js";
import {
  autoImportTpGithubDeadlines,
  extractTPCourseCodes,
  parseGitHubCourseDeadlinesFromReadme
} from "./tp-github-deadlines.js";

const SAMPLE_README = `
# DAT560 Generative AI

- [17.02.2026] Assignment 2 deadline is extended to **22.02.2026 23.59**

| Week | Date       | Topic                               | Comments |
|------|------------|--------------------------------------|----------|
| 5    | 28.01.2026 | **Assignment 1 deadline**            |          |
| 8    | 18.02.2026 | **Assignment 2 deadline**            |          |
| 12   | 18.03.2026 | **Assignment 3 deadline**            |          |
| 17   | 24.04.2026 | **Project + report due**             |          |
`;

describe("tp github deadline auto import", () => {
  it("extracts TP course codes from schedule events", () => {
    const courseCodes = extractTPCourseCodes([
      {
        summary: "DAT560 Forelesning",
        startTime: "2026-02-20T10:15:00.000Z"
      },
      {
        summary: "DAT520 Lab",
        startTime: "2026-02-21T12:15:00.000Z"
      },
      {
        summary: "Random event without course code",
        startTime: "2026-02-21T18:00:00.000Z"
      }
    ]);

    expect(courseCodes).toEqual(["DAT520", "DAT560"]);
  });

  it("parses future deadlines from GitHub README and keeps extension updates", () => {
    const parsed = parseGitHubCourseDeadlinesFromReadme(
      SAMPLE_README,
      "DAT560",
      new Date("2026-02-20T00:00:00.000Z")
    );

    expect(parsed.map((entry) => `${entry.task}::${entry.dueDate}`)).toEqual([
      "Assignment 2 deadline::2026-02-22T23:59:00.000Z",
      "Assignment 3 deadline::2026-03-18T23:59:00.000Z",
      "Project + report due::2026-04-24T23:59:00.000Z"
    ]);
  });

  it("imports and updates deadlines automatically when TP and GitHub MCP are connected", async () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({
      email: "tp-user@example.com",
      passwordHash: "",
      role: "user"
    });
    const userId = user.id;

    upsertMcpServer(store, userId, {
      label: "GitHub MCP (repos read-only)",
      serverUrl: "https://api.githubcopilot.com/mcp/x/repos/readonly",
      token: "test-token",
      toolAllowlist: ["search_repositories", "get_file_contents"]
    });

    // Seed one previously imported deadline so we verify update behavior.
    store.createDeadline(userId, {
      course: "DAT560",
      task: "Assignment 2 deadline",
      dueDate: "2026-02-18T23:59:00.000Z",
      sourceDueDate: "2026-02-18T23:59:00.000Z",
      priority: "high",
      completed: false
    });

    const executeToolCall = async (binding: McpToolBinding): Promise<unknown> => {
      if (binding.remoteToolName === "search_repositories") {
        return {
          serverId: binding.server.id,
          serverLabel: binding.server.label,
          tool: binding.remoteToolName,
          result: {
            text: JSON.stringify({
              total_count: 1,
              items: [
                {
                  name: "info",
                  full_name: "dat560-2026/info",
                  owner: {
                    login: "dat560-2026"
                  }
                }
              ]
            })
          }
        };
      }

      if (binding.remoteToolName === "get_file_contents") {
        return {
          serverId: binding.server.id,
          serverLabel: binding.server.label,
          tool: binding.remoteToolName,
          result: {
            text: "successfully downloaded text file",
            resourceText: SAMPLE_README
          }
        };
      }

      throw new Error(`Unexpected tool call: ${binding.remoteToolName}`);
    };

    const result = await autoImportTpGithubDeadlines(
      store,
      userId,
      [
        {
          summary: "DAT560 Forelesning",
          startTime: "2026-02-20T10:15:00.000Z"
        }
      ],
      {
        now: new Date("2026-02-20T00:00:00.000Z"),
        executeToolCall
      }
    );

    expect(result.attempted).toBe(true);
    expect(result.updated).toBe(1);
    expect(result.imported).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.repositoriesScanned).toEqual(["dat560-2026/info"]);

    const deadlines = store
      .getDeadlines(userId, new Date("2026-02-20T00:00:00.000Z"), false)
      .filter((deadline) => deadline.course === "DAT560")
      .sort((left, right) => left.task.localeCompare(right.task));

    expect(deadlines.map((deadline) => `${deadline.task}::${deadline.dueDate}`)).toEqual([
      "Assignment 2 deadline::2026-02-22T23:59:00.000Z",
      "Assignment 3 deadline::2026-03-18T23:59:00.000Z",
      "Project + report due::2026-04-24T23:59:00.000Z"
    ]);
  });
});
