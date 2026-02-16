import { config } from "./config.js";

export interface GitHubFileContent {
  content: string;
  encoding: string;
  name: string;
  path: string;
  sha: string;
}

export class GitHubCourseClient {
  private readonly token: string | undefined;
  private readonly baseUrl = "https://api.github.com";

  constructor(token?: string) {
    this.token = token ?? config.COURSE_GITHUB_PAT;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    if (!this.token) {
      throw new Error("GitHub PAT not configured");
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Companion-App"
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch the content of a file from a GitHub repository
   */
  async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    const data = await this.fetch<GitHubFileContent>(
      `/repos/${owner}/${repo}/contents/${path}`
    );

    if (data.encoding === "base64") {
      // Decode base64 content
      const decoded = atob(data.content.replace(/\n/g, ""));
      return decoded;
    }

    return data.content;
  }

  /**
   * Fetch README.md from a repository
   */
  async getReadme(owner: string, repo: string): Promise<string> {
    return this.getFileContent(owner, repo, "README.md");
  }
}
