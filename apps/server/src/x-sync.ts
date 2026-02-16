import { RuntimeStore } from "./store.js";
import { XClient, XTweet } from "./x-client.js";
import { XData } from "./types.js";

export interface XSyncResult {
  success: boolean;
  tweetsCount: number;
  error?: string;
}

export interface XSyncOptions {
  maxTweets?: number;
}

export class XSyncService {
  private readonly store: RuntimeStore;
  private readonly client: XClient;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(store: RuntimeStore, client?: XClient) {
    this.store = store;
    this.client = client ?? new XClient();
  }

  /**
   * Start the X sync service with periodic syncing every 4 hours
   */
  start(intervalMs: number = 4 * 60 * 60 * 1000): void {
    if (this.syncInterval) {
      return;
    }

    // Sync immediately on start (only if configured)
    if (this.client.isConfigured()) {
      void this.sync();
    }

    // Then sync periodically
    this.syncInterval = setInterval(() => {
      if (this.client.isConfigured()) {
        void this.sync();
      }
    }, intervalMs);
  }

  /**
   * Stop the X sync service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Perform an X sync
   */
  async sync(options?: XSyncOptions): Promise<XSyncResult> {
    if (!this.client.isConfigured()) {
      return {
        success: false,
        tweetsCount: 0,
        error: "X API credentials not configured"
      };
    }

    try {
      const maxTweets = options?.maxTweets ?? 50;

      // Fetch home timeline
      const tweets = await this.client.fetchHomeTimeline(maxTweets);

      const xData: XData = {
        tweets: tweets.map(tweet => ({
          id: tweet.id,
          text: tweet.text,
          authorId: tweet.authorId,
          authorUsername: tweet.authorUsername,
          authorName: tweet.authorName,
          createdAt: tweet.createdAt,
          likeCount: tweet.likeCount,
          retweetCount: tweet.retweetCount,
          replyCount: tweet.replyCount,
          conversationId: tweet.conversationId
        })),
        lastSyncedAt: new Date().toISOString()
      };

      this.store.setXData(xData);

      return {
        success: true,
        tweetsCount: tweets.length
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("X sync failed:", errorMessage);
      
      return {
        success: false,
        tweetsCount: 0,
        error: errorMessage
      };
    }
  }
}
