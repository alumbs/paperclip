import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const humanAdapter: ServerAdapterModule = {
  type: "human",
  execute,
  testEnvironment,
  models: [],
  supportsLocalAgentJwt: false,
  supportsInstructionsBundle: false,
  requiresMaterializedRuntimeSkills: false,
  agentConfigurationDoc: `# human agent configuration

Adapter: human

Use when:
- You want Paperclip to hand off tasks to an external agent or human operator
- You are using an MCP client (e.g. Windsurf, Claude Code) to do the actual work
- You do not want Paperclip to spawn any process or call any LLM automatically

How it works:
- When a task is assigned to an agent using this adapter, Paperclip acknowledges
  the run immediately (exitCode 0) and leaves the issue in its current status
- The issue will NOT be re-queued automatically
- Your MCP client is responsible for completing the work and calling
  paperclipUpdateIssue (with status "done") when finished

Typical MCP workflow:
1. Windsurf (or any MCP client) calls paperclipInboxLite to see assigned tasks
2. Calls paperclipCheckoutIssue to lock the task
3. Does the work
4. Calls paperclipUpdateIssue with { status: "done" } to close it

No configuration fields required.
`,
};
