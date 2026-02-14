import { BaseAgent, AgentContext } from "../agent-base.js";

export class FoodTrackingAgent extends BaseAgent {
  readonly name = "food-tracking" as const;
  readonly intervalMs = 40_000;

  async run(ctx: AgentContext): Promise<void> {
    ctx.emit(this.event("food.nudge", { message: "Log your meal" }, "low"));
  }
}
