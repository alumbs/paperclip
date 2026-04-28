import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  return {
    adapterType: ctx.adapterType,
    status: "pass",
    checks: [
      {
        code: "human_adapter_ready",
        level: "info",
        message: "Human adapter requires no local dependencies.",
        detail:
          "Tasks will be handed off immediately. Use the Paperclip MCP tools to complete them externally (e.g. via Windsurf, Claude Code, or any MCP client).",
      },
    ],
    testedAt: new Date().toISOString(),
  };
}
