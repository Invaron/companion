import { BaseAgent, AgentContext } from "../agent-base.js";

const lectureHints = [
  { title: "Data Structures", minutesUntil: 90, workload: "medium" },
  { title: "Linear Algebra", minutesUntil: 210, workload: "high" },
  { title: "Systems Design", minutesUntil: 45, workload: "high" }
];

export class LecturePlanAgent extends BaseAgent {
  readonly name = "lecture-plan" as const;
  readonly intervalMs = 2 * 60 * 60 * 1000; // 2 hours — demo agent with placeholder data

  async run(ctx: AgentContext): Promise<void> {
    const next = lectureHints[Math.floor(Math.random() * lectureHints.length)];
    ctx.emit(this.event("lecture.reminder", next, next.minutesUntil < 60 ? "high" : "medium"));
  }
}
