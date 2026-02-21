/**
 * GitHub Student Work Tracker — monitors student lab/assignment repos
 * to track progress and recent activity.
 *
 * Feeds into Gemini context so the AI knows:
 * - How many labs/assignments are completed
 * - When the student last pushed
 * - What they're currently working on
 */

import { GitHubCourseClient, RepoCommit } from "./github-course-client.js";

export interface StudentWorkRepo {
  owner: string;
  repo: string;
  courseCode: string;
  label: string;
  /** Expected assignment directory prefix (e.g., "lab" for lab1/, lab2/, ...) */
  assignmentPrefix?: string;
}

export interface StudentRepoProgress {
  courseCode: string;
  repoFullName: string;
  label: string;
  /** Number of assignment directories with content */
  completedAssignments: number;
  /** Total expected assignments (from course info, or detected) */
  totalAssignments: number | null;
  /** Last commit date */
  lastPushAt: string | null;
  /** Last commit message */
  lastCommitMessage: string | null;
  /** Files/dirs changed in recent commits */
  recentActivity: string[];
  /** Human-readable progress description for Gemini context */
  progressSummary: string;
  /** Tracked at */
  trackedAt: string;
}

export interface StudentWorkTrackingResult {
  success: boolean;
  reposTracked: number;
  progress: StudentRepoProgress[];
  error?: string;
}

// Student work repositories to track
const STUDENT_REPOS: StudentWorkRepo[] = [
  {
    owner: "dat520-2026",
    repo: "lucyscript-labs",
    courseCode: "DAT520",
    label: "individual labs",
    assignmentPrefix: "lab"
  },
  {
    owner: "dat520-2026",
    repo: "defnotai",
    courseCode: "DAT520",
    label: "group project",
    assignmentPrefix: undefined
  },
  {
    owner: "dat560-2026",
    repo: "assigment1-vae-lucyscript",
    courseCode: "DAT560",
    label: "Assignment 1 (VAE)",
    assignmentPrefix: undefined
  },
  {
    owner: "dat560-2026",
    repo: "assigment2-llm-lucyscript",
    courseCode: "DAT560",
    label: "Assignment 2 (LLM)",
    assignmentPrefix: undefined
  }
];

export class StudentWorkTracker {
  private readonly client: GitHubCourseClient;

  constructor(client?: GitHubCourseClient) {
    this.client = client ?? new GitHubCourseClient();
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  getTrackedRepos(): StudentWorkRepo[] {
    return STUDENT_REPOS;
  }

  /**
   * Track progress across all student work repositories.
   */
  async trackAll(): Promise<StudentWorkTrackingResult> {
    if (!this.client.isConfigured()) {
      return { success: false, reposTracked: 0, progress: [], error: "GitHub PAT not configured" };
    }

    const trackedAt = new Date().toISOString();
    const progress: StudentRepoProgress[] = [];
    const errors: string[] = [];

    for (const repo of STUDENT_REPOS) {
      try {
        const result = await this.trackRepo(repo, trackedAt);
        progress.push(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${repo.owner}/${repo.repo}: ${msg}`);
      }
    }

    return {
      success: progress.length > 0,
      reposTracked: progress.length,
      progress,
      error: errors.length > 0 ? errors.join(" | ") : undefined
    };
  }

  /**
   * Track a single student work repository.
   */
  async trackRepo(repo: StudentWorkRepo, trackedAt: string): Promise<StudentRepoProgress> {
    // Fetch recent commits
    let commits: RepoCommit[] = [];
    try {
      commits = await this.client.listCommits(repo.owner, repo.repo, 5);
    } catch {
      // Repo might be empty or inaccessible
    }

    // Fetch tree to count assignment directories
    let completedAssignments = 0;
    let totalAssignments: number | null = null;
    const recentDirs = new Set<string>();

    try {
      const { entries } = await this.client.listRepositoryTree(repo.owner, repo.repo);

      if (repo.assignmentPrefix) {
        // Count directories matching the assignment prefix (e.g., lab1/, lab2/, ...)
        const assignmentDirs = new Set<string>();
        const allMatchingDirs = new Set<string>();

        for (const entry of entries) {
          const parts = entry.path.split("/");
          if (parts.length >= 1) {
            const topDir = parts[0].toLowerCase();
            if (topDir.startsWith(repo.assignmentPrefix.toLowerCase())) {
              allMatchingDirs.add(parts[0]);
              // Only count as "completed" if directory has actual code files (not just README)
              const isCodeFile = parts.length > 1 && !/readme/i.test(entry.path) && /\.(go|py|java|ts|js|rs|c|cpp|h|ipynb)$/i.test(entry.path);
              if (isCodeFile) {
                assignmentDirs.add(parts[0]);
              }
            }
          }
        }

        completedAssignments = assignmentDirs.size;
        // Try to detect total from the highest numbered directory
        const numbers = Array.from(allMatchingDirs)
          .map(dir => {
            const m = dir.match(/\d+/);
            return m ? parseInt(m[0], 10) : 0;
          })
          .filter(n => n > 0);

        if (numbers.length > 0) {
          totalAssignments = Math.max(...numbers);
        }
      } else {
        // For single-assignment repos, check if there are meaningful code files
        const hasCode = entries.some(e =>
          /\.(go|py|java|ts|js|rs|c|cpp|h|ipynb)$/i.test(e.path)
        );
        completedAssignments = hasCode ? 1 : 0;
        totalAssignments = 1;
      }

      // Identify recent activity directories from commits
      if (commits.length > 0) {
        // We can't easily get per-commit file changes from the tree,
        // but we can look at the top-level directories as an approximation
        for (const entry of entries) {
          const topDir = entry.path.split("/")[0];
          if (topDir) recentDirs.add(topDir);
        }
      }
    } catch {
      // Tree fetch failed — work with commits only
    }

    const lastPushAt = commits[0]?.date ?? null;
    const lastCommitMessage = commits[0]?.message ?? null;
    const recentActivity = commits.slice(0, 3).map(c => c.message);

    // Build progress summary
    const progressSummary = this.buildProgressSummary(
      repo, completedAssignments, totalAssignments, lastPushAt, lastCommitMessage
    );

    return {
      courseCode: repo.courseCode,
      repoFullName: `${repo.owner}/${repo.repo}`,
      label: repo.label,
      completedAssignments,
      totalAssignments,
      lastPushAt,
      lastCommitMessage,
      recentActivity,
      progressSummary,
      trackedAt
    };
  }

  private buildProgressSummary(
    repo: StudentWorkRepo,
    completed: number,
    total: number | null,
    lastPushAt: string | null,
    lastCommitMsg: string | null
  ): string {
    const parts: string[] = [];

    // Progress fraction
    if (total !== null && repo.assignmentPrefix) {
      parts.push(`${completed}/${total} ${repo.assignmentPrefix}s completed`);
    } else if (completed > 0) {
      parts.push("has content");
    } else {
      parts.push("no code files yet");
    }

    // Recency
    if (lastPushAt) {
      const daysAgo = Math.floor((Date.now() - Date.parse(lastPushAt)) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) {
        parts.push("last push today");
      } else if (daysAgo === 1) {
        parts.push("last push yesterday");
      } else {
        parts.push(`last push ${daysAgo}d ago`);
      }
    }

    // Last commit context
    if (lastCommitMsg) {
      parts.push(`"${lastCommitMsg.slice(0, 50)}"`);
    }

    return `${repo.courseCode} ${repo.label}: ${parts.join(", ")}`;
  }

  /**
   * Build a concise context string for Gemini system prompt.
   */
  buildContextSummary(progress: StudentRepoProgress[]): string {
    if (progress.length === 0) {
      return "Student work repos: not tracked yet.";
    }

    const lines = ["**Student Work Progress:**"];
    for (const p of progress) {
      lines.push(`- ${p.progressSummary}`);
    }
    return lines.join("\n");
  }
}
