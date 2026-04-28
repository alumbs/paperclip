import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { onLog, onMeta, context } = ctx;

  if (onMeta) {
    await onMeta({
      adapterType: "human",
      command: null,
      cwd: null,
      commandNotes: ["Task handed off. An external agent (e.g. Windsurf via MCP) will complete this issue."],
      commandArgs: [],
      env: {},
      prompt: null,
      promptMetrics: null,
      context,
    });
  }

  await onLog(
    "stdout",
    "[paperclip] human adapter: task is ready for pickup. Use the Paperclip MCP tools (paperclipCheckoutIssue, paperclipUpdateIssue, paperclipReleaseIssue) to complete this issue.\n",
  );

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    summary: "Task handed off to external agent via MCP.",
  };
}
