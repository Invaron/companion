import { config } from "./config.js";
import {
  GeminiClient,
  GeminiError,
  RateLimitError,
  GeminiMessage,
  buildContextWindow,
  buildSystemPrompt,
  getGeminiClient
} from "./gemini.js";
import { RuntimeStore } from "./store.js";
import { ChatHistoryPage, ChatMessage, ChatMessageMetadata, UserContext } from "./types.js";

interface ChatContextResult {
  contextWindow: string;
  history: ChatMessage[];
}

function isSameDay(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getUTCFullYear() === dateB.getUTCFullYear() &&
    dateA.getUTCMonth() === dateB.getUTCMonth() &&
    dateA.getUTCDate() === dateB.getUTCDate()
  );
}

function buildCanvasContextSummary(store: RuntimeStore, now: Date = new Date()): string {
  const canvasData = store.getCanvasData();
  
  if (!canvasData || canvasData.announcements.length === 0) {
    return "Canvas data: no synced courses yet. Connect Canvas to enrich responses with assignments, modules, and announcements.";
  }

  const recentAnnouncements = canvasData.announcements
    .filter((ann) => {
      const postedAt = new Date(ann.posted_at);
      if (Number.isNaN(postedAt.getTime())) {
        return false;
      }
      const daysSincePosted = (now.getTime() - postedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSincePosted <= 7;
    })
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
    .slice(0, 5);

  if (recentAnnouncements.length === 0) {
    return "Canvas: No recent announcements (last 7 days).";
  }

  const parts = ["**Canvas Announcements (last 7 days):**"];
  recentAnnouncements.forEach((ann) => {
    const postedDate = new Date(ann.posted_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
    const preview = ann.message.replace(/<[^>]*>/g, "").slice(0, 80);
    parts.push(`- ${ann.title} (${postedDate}): ${preview}${ann.message.length > 80 ? "..." : ""}`);
  });

  return parts.join("\n");
}

function buildSocialMediaContextSummary(store: RuntimeStore, now: Date = new Date()): string {
  const parts: string[] = [];
  
  // YouTube context
  const youtubeData = store.getYouTubeData();
  if (youtubeData && youtubeData.videos.length > 0) {
    const recentVideos = youtubeData.videos
      .filter((video) => {
        const publishedAt = new Date(video.publishedAt);
        if (Number.isNaN(publishedAt.getTime())) {
          return false;
        }
        const hoursSincePublished = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
        return hoursSincePublished <= 72; // Last 3 days
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 5);

    if (recentVideos.length > 0) {
      parts.push("**Recent YouTube Videos (last 3 days):**");
      recentVideos.forEach((video) => {
        const publishedDate = new Date(video.publishedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        });
        const titlePreview = video.title.length > 60 ? video.title.slice(0, 60) + "..." : video.title;
        parts.push(`- ${video.channelTitle}: "${titlePreview}" (${publishedDate})`);
      });
    }
  }

  // X/Twitter context
  const xData = store.getXData();
  if (xData && xData.tweets.length > 0) {
    const recentTweets = xData.tweets
      .filter((tweet) => {
        const createdAt = new Date(tweet.createdAt);
        if (Number.isNaN(createdAt.getTime())) {
          return false;
        }
        const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        return hoursSinceCreated <= 48; // Last 2 days
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    if (recentTweets.length > 0) {
      if (parts.length > 0) {
        parts.push("");
      }
      parts.push("**Recent Posts on X (last 2 days):**");
      recentTweets.forEach((tweet) => {
        const createdDate = new Date(tweet.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        });
        const textPreview = tweet.text.length > 80 ? tweet.text.slice(0, 80) + "..." : tweet.text;
        parts.push(`- @${tweet.authorUsername} (${createdDate}): ${textPreview}`);
      });
    }
  }

  if (parts.length === 0) {
    return "Social media: No recent data synced. Enable YouTube or X integrations to get updates.";
  }

  return parts.join("\n");
}

export function buildChatContext(store: RuntimeStore, now: Date = new Date(), historyLimit = 10): ChatContextResult {
  const todaySchedule = store
    .getScheduleEvents()
    .filter((event) => isSameDay(new Date(event.startTime), now));

  const upcomingDeadlines = store
    .getDeadlines(now)
    .filter((deadline) => {
      const due = new Date(deadline.dueDate);
      if (Number.isNaN(due.getTime())) {
        return false;
      }
      const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7;
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const recentJournals = store.getJournalEntries(3);
  const userState: UserContext = store.getUserContext();
  const canvasContext = buildCanvasContextSummary(store, now);
  const socialMediaContext = buildSocialMediaContextSummary(store, now);

  const contextWindow = buildContextWindow({
    todaySchedule,
    upcomingDeadlines,
    recentJournals,
    userState,
    customContext: `${canvasContext}\n\n${socialMediaContext}`
  });

  const history = store.getRecentChatMessages(historyLimit);

  return { contextWindow, history };
}

function toGeminiMessages(history: ChatMessage[], userInput: string): GeminiMessage[] {
  const formatted: GeminiMessage[] = history.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));

  formatted.push({
    role: "user" as const,
    parts: [{ text: userInput }]
  });

  return formatted;
}

export interface SendChatResult {
  reply: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  finishReason?: string;
  usage?: ChatMessageMetadata["usage"];
  history: ChatHistoryPage;
}

export async function sendChatMessage(
  store: RuntimeStore,
  userInput: string,
  options: { now?: Date; geminiClient?: GeminiClient } = {}
): Promise<SendChatResult> {
  const now = options.now ?? new Date();
  const gemini = options.geminiClient ?? getGeminiClient();
  const { contextWindow, history } = buildChatContext(store, now);

  const systemInstruction = buildSystemPrompt(config.AXIS_USER_NAME, contextWindow);
  const messages = toGeminiMessages(history, userInput);

  const response = await gemini.generateChatResponse({
    messages,
    systemInstruction
  });

  const userMessage = store.recordChatMessage("user", userInput);

  const assistantMetadata: ChatMessageMetadata = {
    contextWindow,
    finishReason: response.finishReason,
    usage: response.usageMetadata
      ? {
          promptTokens: response.usageMetadata.promptTokenCount,
          responseTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount
        }
      : undefined
  };

  const assistantMessage = store.recordChatMessage("assistant", response.text, assistantMetadata);

  const historyPage = store.getChatHistory({ page: 1, pageSize: 20 });

  return {
    reply: assistantMessage.content,
    userMessage,
    assistantMessage,
    finishReason: response.finishReason,
    usage: assistantMetadata.usage,
    history: historyPage
  };
}

export { GeminiError, RateLimitError };
