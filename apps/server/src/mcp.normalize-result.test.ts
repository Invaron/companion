import { describe, expect, it } from "vitest";
import { normalizeMcpToolResult } from "./mcp.js";

describe("normalizeMcpToolResult", () => {
  it("extracts text resource payloads alongside status text", () => {
    const normalized = normalizeMcpToolResult({
      content: [
        { type: "text", text: "successfully downloaded text file (SHA: 123)" },
        {
          type: "resource",
          resource: {
            uri: "repo://octo/repo/contents/README.md",
            mimeType: "text/markdown",
            text: "# Course\n\n- **Assignment 1 deadline**"
          }
        }
      ]
    }) as Record<string, unknown>;

    expect(normalized.text).toContain("successfully downloaded text file");
    expect(normalized.resourceText).toContain("Assignment 1 deadline");
    expect(normalized.resourceUris).toEqual(["repo://octo/repo/contents/README.md"]);
  });

  it("decodes text blobs from resource payloads", () => {
    const normalized = normalizeMcpToolResult({
      content: [
        {
          type: "resource",
          resource: {
            uri: "repo://octo/repo/contents/README.md",
            mimeType: "text/plain",
            blob: Buffer.from("hello from blob", "utf8").toString("base64")
          }
        }
      ]
    }) as Record<string, unknown>;

    expect(normalized.resourceText).toContain("hello from blob");
  });
});
