import { BaseAgent, AgentContext } from "../agent-base.js";

export class VideoEditorAgent extends BaseAgent {
  readonly name = "video-editor" as const;
  readonly intervalMs = 60_000;

  async run(ctx: AgentContext): Promise<void> {
    ctx.emit(this.event("video.digest-ready", { ready: true }, "medium"));
  }
}
