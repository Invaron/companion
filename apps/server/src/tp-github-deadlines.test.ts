import { describe, expect, it } from "vitest";
import { SchemaType } from "@google/generative-ai";
import { RuntimeStore } from "./store.js";
import type { McpToolContext, McpToolBinding } from "./mcp.js";
import {
  extractTPCourseCodes,
  isGithubMcpServer,
  runTpGithubDeadlineSubAgent
} from "./tp-github-deadlines.js";
import type { GeminiChatResponse } from "./gemini.js";

function makeStubModel(responses: GeminiChatResponse[]): {
  isConfigured: () => boolean;
  generateChatResponse: (request: {
    messages: unknown[];
    systemInstruction?: string;
    tools?: unknown[];
  }) => Promise<GeminiChatResponse>;
} {
  let index = 0;

  return {
    isConfigured: () => true,
    generateChatResponse: async () => {
      const next = responses[Math.min(index, responses.length - 1)] ?? { text: "", functionCalls: [] };
      index += 1;
      return next;
    }
  };
}

function makeGithubMcpContext(serverId = "github-mcp-server"): McpToolContext {
  const server = {
    id: serverId,
    label: "GitHub MCP (repos read-only)",
    serverUrl: "https://api.githubcopilot.com/mcp/x/repos/readonly",
    token: "token",
    enabled: true,
    toolAllowlist: []
  };

  const searchToolName = "mcp_github_mcp_server__search_repositories";
  const readToolName = "mcp_github_mcp_server__get_file_contents";

  const declarations = [
    {
      name: searchToolName,
      description: "search repos",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING }
        },
        required: ["query"]
      }
    },
    {
      name: readToolName,
      description: "read file",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          owner: { type: SchemaType.STRING },
          repo: { type: SchemaType.STRING },
          path: { type: SchemaType.STRING }
        },
        required: ["owner", "repo", "path"]
      }
    }
  ] as unknown as McpToolContext["declarations"];

  const bindings = new Map<string, McpToolBinding>([
    [
      searchToolName,
      {
        server,
        remoteToolName: "search_repositories"
      }
    ],
    [
      readToolName,
      {
        server,
        remoteToolName: "get_file_contents"
      }
    ]
  ]);

  return {
    declarations,
    bindings,
    summary: "GitHub MCP tools"
  };
}

describe("tp github deadline sub-agent", () => {
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

  it("identifies GitHub MCP servers by label or URL", () => {
    expect(
      isGithubMcpServer({
        label: "GitHub MCP",
        serverUrl: "https://example.com/mcp"
      })
    ).toBe(true);

    expect(
      isGithubMcpServer({
        label: "Custom MCP",
        serverUrl: "https://api.githubcopilot.com/mcp/x/repos/readonly"
      })
    ).toBe(true);

    expect(
      isGithubMcpServer({
        label: "Notion MCP",
        serverUrl: "https://notion.example/mcp"
      })
    ).toBe(false);
  });

  it("runs a non-chat background tool loop and imports deadlines", async () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({
      email: "tp-user@example.com",
      passwordHash: "",
      role: "user"
    });

    const model = makeStubModel([
      {
        text: "",
        functionCalls: [
          {
            name: "mcp_github_mcp_server__search_repositories",
            args: {
              query: "DAT560 in:name"
            }
          }
        ]
      },
      {
        text: "",
        functionCalls: [
          {
            name: "mcp_github_mcp_server__get_file_contents",
            args: {
              owner: "dat560-2026",
              repo: "info",
              path: "README.md"
            }
          }
        ]
      },
      {
        text: "",
        functionCalls: [
          {
            name: "createDeadline",
            args: {
              course: "DAT560",
              task: "Assignment 3",
              dueDate: "2026-03-18T23:59:00.000Z",
              priority: "high"
            }
          }
        ]
      },
      {
        text: "import complete",
        functionCalls: []
      }
    ]);

    const result = await runTpGithubDeadlineSubAgent(
      {
        store,
        userId: user.id,
        tpIcalUrl: "https://tp.educloud.no/ical/abc",
        githubServerId: "github-mcp-server"
      },
      {
        geminiClient: model,
        tpEvents: [
          {
            summary: "DAT560 Forelesning",
            startTime: "2026-02-20T10:15:00.000Z"
          }
        ],
        buildMcpToolContext: async () => makeGithubMcpContext(),
        executeMcpToolCall: async (binding) => ({
          serverId: binding.server.id,
          serverLabel: binding.server.label,
          tool: binding.remoteToolName,
          result: {
            text: "ok"
          }
        })
      }
    );

    expect(result.attempted).toBe(true);
    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.errors).toEqual([]);

    const deadlines = store.getDeadlines(user.id, new Date("2026-02-20T00:00:00.000Z"), false);
    expect(deadlines.some((deadline) => deadline.course === "DAT560" && deadline.task === "Assignment 3")).toBe(true);

    // Confirms this path does not go through chat history.
    expect(store.getChatMessageCount(user.id)).toBe(0);
  });

  it("supports rescheduling existing deadlines via queueDeadlineAction in the sub-agent", async () => {
    const store = new RuntimeStore(":memory:");
    const user = store.createUser({
      email: "tp-user2@example.com",
      passwordHash: "",
      role: "user"
    });

    const existing = store.createDeadline(user.id, {
      course: "DAT560",
      task: "Assignment 2",
      dueDate: "2026-02-18T23:59:00.000Z",
      priority: "high",
      completed: false
    });

    const model = makeStubModel([
      {
        text: "",
        functionCalls: [
          {
            name: "getDeadlines",
            args: {
              daysAhead: 120,
              includeOverdue: true
            }
          }
        ]
      },
      {
        text: "",
        functionCalls: [
          {
            name: "queueDeadlineAction",
            args: {
              deadlineId: existing.id,
              action: "reschedule",
              newDueDate: "2026-02-22T23:59:00.000Z"
            }
          }
        ]
      },
      {
        text: "done",
        functionCalls: []
      }
    ]);

    const result = await runTpGithubDeadlineSubAgent(
      {
        store,
        userId: user.id,
        tpIcalUrl: "https://tp.educloud.no/ical/xyz",
        githubServerId: "github-mcp-server"
      },
      {
        geminiClient: model,
        tpEvents: [
          {
            summary: "DAT560 Forelesning",
            startTime: "2026-02-20T10:15:00.000Z"
          }
        ],
        buildMcpToolContext: async () => makeGithubMcpContext(),
        executeMcpToolCall: async () => ({ result: { text: "ok" } })
      }
    );

    expect(result.updated).toBe(1);

    const updated = store.getDeadlineById(user.id, existing.id, false);
    expect(updated?.dueDate).toBe("2026-02-22T23:59:00.000Z");
  });
});
