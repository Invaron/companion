import { FunctionDeclaration, FunctionCall, Part } from "@google/generative-ai";
import type { ImportedCalendarEvent } from "./calendar-import.js";
import { config } from "./config.js";
import { functionDeclarations, executeFunctionCall } from "./gemini-tools.js";
import type { GeminiChatResponse, GeminiMessage } from "./gemini.js";
import { getGeminiClient } from "./gemini.js";
import {
  buildMcpToolContext,
  executeMcpToolCall,
  type McpServerConfig,
  type McpToolBinding,
  type McpToolContext
} from "./mcp.js";
import { RuntimeStore } from "./store.js";
import { fetchTPSchedule } from "./tp-sync.js";

const COURSE_CODE_REGEX = /\b[A-Z]{3}\d{3}\b/g;
const MAX_FUNCTION_ROUNDS = 10;
const MAX_IDENTICAL_TOOL_CALLS_PER_TURN = 2;
const MAX_LOCAL_TOOL_CALLS_PER_NAME = 12;

const LOCAL_DEADLINE_TOOL_NAMES = new Set<string>([
  "getDeadlines",
  "createDeadline",
  "queueDeadlineAction"
]);

const inFlightTpGithubJobs = new Set<string>();

interface LoggerLike {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

interface ToolResponseEntry {
  name: string;
  response: unknown;
}

interface DeadlineMutationCounters {
  imported: number;
  updated: number;
  skipped: number;
}

export interface TpGithubDeadlineSubAgentJob {
  store: RuntimeStore;
  userId: string;
  tpIcalUrl: string;
  githubServerId: string;
}

export interface TpGithubDeadlineSubAgentRunResult {
  attempted: boolean;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  courseCodes: string[];
  executedTools: string[];
  finalText?: string;
}

interface TpGithubDeadlineSubAgentModelClient {
  isConfigured?: () => boolean;
  generateChatResponse: (request: {
    messages: GeminiMessage[];
    systemInstruction?: string;
    tools?: FunctionDeclaration[];
    googleSearchGrounding?: boolean;
  }) => Promise<GeminiChatResponse>;
}

export interface TpGithubDeadlineSubAgentDependencies {
  now?: Date;
  logger?: LoggerLike;
  tpEvents?: ImportedCalendarEvent[];
  geminiClient?: TpGithubDeadlineSubAgentModelClient;
  buildMcpToolContext?: (store: RuntimeStore, userId: string) => Promise<McpToolContext>;
  executeMcpToolCall?: (binding: McpToolBinding, args: Record<string, unknown>, store?: RuntimeStore, userId?: string) => Promise<unknown>;
  executeFunctionCall?: typeof executeFunctionCall;
  fetchTpSchedule?: typeof fetchTPSchedule;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizeForToolSignature(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeForToolSignature(entry));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const normalized: Record<string, unknown> = {};
    sortedKeys.forEach((key) => {
      normalized[key] = canonicalizeForToolSignature(record[key]);
    });
    return normalized;
  }
  return value;
}

function isMcpRateLimitedResponse(response: unknown): boolean {
  const payload = asRecord(response);
  if (!payload) {
    return false;
  }
  const result = asRecord(payload.result);
  if (!result || result.isError !== true) {
    return false;
  }
  const text = asTrimmedString(result.text);
  if (!text) {
    return false;
  }
  return /rate limit exceeded|secondary rate limit|too many requests|retry after/i.test(text);
}

function maxCallsPerToolInTurn(toolName: string, binding: McpToolBinding | undefined): number {
  if (binding?.remoteToolName === "search_code") {
    return 2;
  }
  if (binding?.remoteToolName === "search_repositories") {
    return 4;
  }
  if (binding?.remoteToolName === "get_file_contents") {
    return 8;
  }
  if (binding?.remoteToolName === "list_repositories" || binding?.remoteToolName === "list_repository") {
    return 4;
  }
  if (LOCAL_DEADLINE_TOOL_NAMES.has(toolName)) {
    return MAX_LOCAL_TOOL_CALLS_PER_NAME;
  }
  return 6;
}

function parseFunctionCallArgs(call: FunctionCall): Record<string, unknown> {
  return call.args && typeof call.args === "object" && !Array.isArray(call.args)
    ? (call.args as Record<string, unknown>)
    : {};
}

function selectGithubBindingsForServer(
  context: McpToolContext,
  githubServerId: string
): { declarations: FunctionDeclaration[]; bindings: Map<string, McpToolBinding> } {
  const declarations: FunctionDeclaration[] = [];
  const bindings = new Map<string, McpToolBinding>();

  context.declarations.forEach((declaration) => {
    const binding = context.bindings.get(declaration.name);
    if (!binding) {
      return;
    }
    if (binding.server.id !== githubServerId) {
      return;
    }
    if (!isGithubMcpServer(binding.server)) {
      return;
    }
    declarations.push(declaration);
    bindings.set(declaration.name, binding);
  });

  return { declarations, bindings };
}

function buildSubAgentSystemInstruction(now: Date): string {
  return [
    "You are a background GitHub deadline importer sub-agent.",
    "Goal: discover explicit future deadlines in GitHub course repositories and apply them to local deadlines via tools.",
    "Do not ask the user questions.",
    "Use MCP GitHub tools to find candidate repositories and read files; do not invent repositories or deadlines.",
    "Use local tools getDeadlines/createDeadline/queueDeadlineAction to apply changes.",
    "If the same course/task already exists with a different due date, use queueDeadlineAction action=reschedule.",
    "Only import future deadlines with explicit date/time evidence from repository content.",
    "Avoid tool-call loops; keep calls minimal and stop once all course codes are checked.",
    `Current timestamp (UTC): ${now.toISOString()}`
  ].join("\n");
}

function buildSubAgentPrompt(courseCodes: string[], githubServerId: string, tpIcalUrl: string): string {
  return [
    `Connected TP iCal source: ${tpIcalUrl}`,
    `Detected course codes from TP schedule: ${courseCodes.join(", ")}`,
    `Use MCP tools from connected GitHub server ID: ${githubServerId}.`,
    "Workflow:",
    "1) Search repositories whose names include each course code.",
    "2) Inspect repository tree/root files to find documents with deadline information (for example README/schedule/assignments docs).",
    "3) Read candidate files and extract explicit future due dates.",
    "4) Apply results with local deadline tools.",
    "Return a short completion summary after tool calls finish."
  ].join("\n");
}

function updateDeadlineCountersFromToolResponse(
  counters: DeadlineMutationCounters,
  toolName: string,
  response: unknown
): void {
  if (!LOCAL_DEADLINE_TOOL_NAMES.has(toolName)) {
    return;
  }

  const payload = asRecord(response);
  if (!payload) {
    counters.skipped += 1;
    return;
  }

  if (toolName === "createDeadline") {
    if (payload.success === true && payload.created === true) {
      counters.imported += 1;
      return;
    }
    if (payload.success === true && payload.created === false) {
      counters.skipped += 1;
      return;
    }
    if (payload.error) {
      counters.skipped += 1;
    }
    return;
  }

  if (toolName === "queueDeadlineAction") {
    if (payload.success === true && payload.action === "reschedule") {
      counters.updated += 1;
      return;
    }
    if (payload.success === true && payload.action === "complete") {
      counters.skipped += 1;
      return;
    }
    if (payload.error) {
      counters.skipped += 1;
    }
    return;
  }
}

function toToolCallSignature(toolName: string, args: Record<string, unknown>): string {
  try {
    return `${toolName}:${JSON.stringify(canonicalizeForToolSignature(args))}`;
  } catch {
    return `${toolName}:${String(args)}`;
  }
}

function buildLocalDeadlineToolDeclarations(): FunctionDeclaration[] {
  return functionDeclarations.filter((declaration) => LOCAL_DEADLINE_TOOL_NAMES.has(declaration.name));
}

export function extractTPCourseCodes(events: ImportedCalendarEvent[]): string[] {
  const codes = new Set<string>();
  for (const event of events) {
    const matches = event.summary.toUpperCase().match(COURSE_CODE_REGEX) ?? [];
    matches.forEach((match) => codes.add(match));
  }
  return Array.from(codes).sort();
}

export function isGithubMcpServer(server: Pick<McpServerConfig, "label" | "serverUrl">): boolean {
  return /github/i.test(server.label) || /github/i.test(server.serverUrl);
}

export async function runTpGithubDeadlineSubAgent(
  job: TpGithubDeadlineSubAgentJob,
  deps: TpGithubDeadlineSubAgentDependencies = {}
): Promise<TpGithubDeadlineSubAgentRunResult> {
  const logger = deps.logger ?? console;
  const now = deps.now ?? new Date();
  const model = deps.geminiClient ?? getGeminiClient();
  const buildToolContext = deps.buildMcpToolContext ?? buildMcpToolContext;
  const callMcpTool = deps.executeMcpToolCall ?? executeMcpToolCall;
  const callLocalTool = deps.executeFunctionCall ?? executeFunctionCall;
  const fetchTp = deps.fetchTpSchedule ?? fetchTPSchedule;

  const result: TpGithubDeadlineSubAgentRunResult = {
    attempted: false,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    courseCodes: [],
    executedTools: []
  };

  if (typeof model.isConfigured === "function" && !model.isConfigured()) {
    result.errors.push("Gemini is not configured on this server.");
    return result;
  }

  try {
    const tpEvents = deps.tpEvents
      ?? await fetchTp({
        icalUrl: job.tpIcalUrl,
        pastDays: config.INTEGRATION_WINDOW_PAST_DAYS,
        futureDays: config.INTEGRATION_WINDOW_FUTURE_DAYS
      });

    const courseCodes = extractTPCourseCodes(tpEvents);
    result.courseCodes = courseCodes;

    if (courseCodes.length === 0) {
      result.errors.push("No TP course codes found for GitHub deadline import.");
      return result;
    }

    const context = await buildToolContext(job.store, job.userId);
    const githubContext = selectGithubBindingsForServer(context, job.githubServerId);

    if (githubContext.declarations.length === 0) {
      result.errors.push(`No GitHub MCP tools available for server ${job.githubServerId}.`);
      return result;
    }

    const localDeclarations = buildLocalDeadlineToolDeclarations();
    const toolDeclarations = [...localDeclarations, ...githubContext.declarations];

    const workingMessages: GeminiMessage[] = [
      {
        role: "user",
        parts: [{ text: buildSubAgentPrompt(courseCodes, job.githubServerId, job.tpIcalUrl) }]
      }
    ];

    const systemInstruction = buildSubAgentSystemInstruction(now);
    const counters: DeadlineMutationCounters = { imported: 0, updated: 0, skipped: 0 };
    const toolCallSignatureCount = new Map<string, number>();
    const toolCallNameCount = new Map<string, number>();
    const blockedToolNames = new Set<string>();
    let finalText = "";

    for (let round = 0; round < MAX_FUNCTION_ROUNDS; round += 1) {
      const response = await model.generateChatResponse({
        messages: workingMessages,
        systemInstruction,
        tools: toolDeclarations
      });

      const functionCalls = response.functionCalls ?? [];
      finalText = response.text?.trim() ?? finalText;
      if (functionCalls.length === 0) {
        break;
      }

      result.attempted = true;
      const roundResponses: ToolResponseEntry[] = [];

      for (const call of functionCalls) {
        const args = parseFunctionCallArgs(call);
        const mcpBinding = githubContext.bindings.get(call.name);
        const toolLimitKey = mcpBinding
          ? `mcp:${mcpBinding.server.id}:${mcpBinding.remoteToolName}`
          : call.name;

        const signature = toToolCallSignature(call.name, args);
        const signatureCount = toolCallSignatureCount.get(signature) ?? 0;
        if (signatureCount >= MAX_IDENTICAL_TOOL_CALLS_PER_TURN) {
          roundResponses.push({
            name: call.name,
            response: {
              error: "Skipped repeated identical tool call to prevent loop exhaustion."
            }
          });
          continue;
        }
        toolCallSignatureCount.set(signature, signatureCount + 1);

        if (blockedToolNames.has(toolLimitKey)) {
          roundResponses.push({
            name: call.name,
            response: {
              error: "Skipped tool call after earlier rate-limit response in this run."
            }
          });
          continue;
        }

        const callCount = toolCallNameCount.get(toolLimitKey) ?? 0;
        const maxCalls = maxCallsPerToolInTurn(call.name, mcpBinding);
        if (callCount >= maxCalls) {
          roundResponses.push({
            name: call.name,
            response: {
              error: `Skipped repeated ${mcpBinding?.remoteToolName ?? call.name} calls to prevent tool-loop exhaustion.`
            }
          });
          continue;
        }
        toolCallNameCount.set(toolLimitKey, callCount + 1);

        try {
          let responsePayload: unknown;
          if (mcpBinding) {
            responsePayload = await callMcpTool(mcpBinding, args, job.store, job.userId);
            if (isMcpRateLimitedResponse(responsePayload)) {
              blockedToolNames.add(toolLimitKey);
            }
          } else if (LOCAL_DEADLINE_TOOL_NAMES.has(call.name)) {
            responsePayload = callLocalTool(call.name, args, job.store, job.userId).response;
            updateDeadlineCountersFromToolResponse(counters, call.name, responsePayload);
          } else {
            responsePayload = { error: `Unsupported tool for TP GitHub sub-agent: ${call.name}` };
          }

          roundResponses.push({
            name: call.name,
            response: responsePayload
          });
          result.executedTools.push(call.name);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool call failed";
          if (/rate limit exceeded|secondary rate limit|too many requests|retry after/i.test(message)) {
            blockedToolNames.add(toolLimitKey);
          }
          roundResponses.push({
            name: call.name,
            response: { error: message }
          });
          result.errors.push(`${call.name}: ${message}`);
        }
      }

      workingMessages.push({
        role: "model",
        parts: functionCalls.map((call) => ({ functionCall: call })) as Part[]
      });
      workingMessages.push({
        role: "function",
        parts: roundResponses.map((entry) => ({
          functionResponse: {
            name: entry.name,
            response: entry.response
          }
        })) as Part[]
      });
    }

    result.attempted = true;
    result.imported = counters.imported;
    result.updated = counters.updated;
    result.skipped = counters.skipped;
    if (finalText.length > 0) {
      result.finalText = finalText;
    }

    logger.info(
      `[tp-github-sub-agent] user=${job.userId} server=${job.githubServerId} imported=${result.imported} updated=${result.updated} skipped=${result.skipped}`
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "TP GitHub sub-agent failed";
    result.errors.push(message);
    result.attempted = true;
    logger.error(`[tp-github-sub-agent] user=${job.userId} server=${job.githubServerId} failed: ${message}`);
    return result;
  }
}

export function scheduleTpGithubDeadlineSubAgent(
  job: TpGithubDeadlineSubAgentJob,
  deps: TpGithubDeadlineSubAgentDependencies = {}
): boolean {
  const key = `${job.userId}:${job.githubServerId}`;
  if (inFlightTpGithubJobs.has(key)) {
    return false;
  }

  const logger = deps.logger ?? console;
  inFlightTpGithubJobs.add(key);

  setTimeout(() => {
    void runTpGithubDeadlineSubAgent(job, deps)
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown TP GitHub sub-agent error";
        logger.error(`[tp-github-sub-agent] job=${key} unhandled failure: ${message}`);
      })
      .finally(() => {
        inFlightTpGithubJobs.delete(key);
      });
  }, 0);

  return true;
}
