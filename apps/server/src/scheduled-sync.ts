import { RuntimeStore } from "./store.js";
import { GitHubSyncService } from "./github-sync.js";

/**
 * Scheduled sync service that runs external data syncs on a schedule
 */
export class ScheduledSyncService {
  private readonly store: RuntimeStore;
  private githubSyncInterval: ReturnType<typeof setInterval> | null = null;
  private lastGitHubSync: Date | null = null;

  constructor(store: RuntimeStore) {
    this.store = store;
  }

  /**
   * Start the scheduled sync service
   * GitHub sync runs daily (24 hours)
   */
  start(): void {
    // GitHub sync: Daily (every 24 hours)
    const githubIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
    
    // Run GitHub sync immediately on start
    void this.runGitHubSync();
    
    // Then schedule it to run daily
    this.githubSyncInterval = setInterval(() => {
      void this.runGitHubSync();
    }, githubIntervalMs);
  }

  /**
   * Stop the scheduled sync service
   */
  stop(): void {
    if (this.githubSyncInterval) {
      clearInterval(this.githubSyncInterval);
      this.githubSyncInterval = null;
    }
  }

  /**
   * Run GitHub course sync
   */
  private async runGitHubSync(): Promise<void> {
    try {
      console.log("[ScheduledSync] Starting GitHub course sync...");
      
      const githubSync = new GitHubSyncService();
      const deadlines = await githubSync.syncDeadlines();
      const result = this.store.syncGitHubDeadlines(deadlines);
      
      this.store.updateGitHubSyncMetadata("success");
      this.lastGitHubSync = new Date();
      
      console.log(
        `[ScheduledSync] GitHub sync completed: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged (${deadlines.length} total deadlines found)`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ScheduledSync] GitHub sync failed:`, errorMessage);
      this.store.updateGitHubSyncMetadata("error", errorMessage);
    }
  }

  /**
   * Get last sync times
   */
  getStatus(): {
    githubLastSync: Date | null;
  } {
    return {
      githubLastSync: this.lastGitHubSync
    };
  }
}
