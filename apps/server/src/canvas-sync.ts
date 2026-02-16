import { RuntimeStore } from "./store.js";
import { CanvasClient } from "./canvas-client.js";
import { CanvasData } from "./types.js";

export interface CanvasSyncResult {
  success: boolean;
  coursesCount: number;
  assignmentsCount: number;
  modulesCount: number;
  announcementsCount: number;
  error?: string;
}

export class CanvasSyncService {
  private readonly store: RuntimeStore;
  private readonly client: CanvasClient;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(store: RuntimeStore, client?: CanvasClient) {
    this.store = store;
    this.client = client ?? new CanvasClient();
  }

  /**
   * Start the Canvas sync service with periodic syncing every 30 minutes
   */
  start(intervalMs: number = 30 * 60 * 1000): void {
    if (this.syncInterval) {
      return;
    }

    // Sync immediately on start
    void this.sync();

    // Then sync periodically
    this.syncInterval = setInterval(() => {
      void this.sync();
    }, intervalMs);
  }

  /**
   * Stop the Canvas sync service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Perform a Canvas sync
   */
  async sync(): Promise<CanvasSyncResult> {
    try {
      const courses = await this.client.getCourses();
      const assignments = await this.client.getAllAssignments(courses);
      const modules = await this.client.getAllModules(courses);
      const announcements = await this.client.getAnnouncements();

      const canvasData: CanvasData = {
        courses,
        assignments,
        modules,
        announcements,
        lastSyncedAt: new Date().toISOString()
      };

      this.store.setCanvasData(canvasData);

      return {
        success: true,
        coursesCount: courses.length,
        assignmentsCount: assignments.length,
        modulesCount: modules.length,
        announcementsCount: announcements.length
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      return {
        success: false,
        coursesCount: 0,
        assignmentsCount: 0,
        modulesCount: 0,
        announcementsCount: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Manually trigger a sync
   */
  async triggerSync(): Promise<CanvasSyncResult> {
    return this.sync();
  }
}
