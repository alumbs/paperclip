export const type = "windsurf";
export const label = "Windsurf CLI (local)";
export const DEFAULT_WINDSURF_LOCAL_MODEL = "auto";

const WINDSURF_FALLBACK_MODEL_IDS = [
  "auto",
  "cascade-base",
  "cascade-advanced",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "o3",
  "o3-mini",
  "o4-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

export const models = WINDSURF_FALLBACK_MODEL_IDS.map((id) => ({ id, label: id }));

export const agentConfigurationDoc = `# windsurf agent configuration

Adapter: windsurf

Use when:
- You want Paperclip to run Windsurf CLI locally as the agent runtime
- You want Windsurf flow session resume across heartbeats via --resume
- You want structured stream output in run logs via --output-format stream-json

Don't use when:
- You need webhook-style external invocation (use openclaw_gateway or http)
- You only need one-shot shell commands (use process)
- Windsurf CLI is not installed on the machine

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- promptTemplate (string, optional): run prompt template
- model (string, optional): Windsurf model id (for example auto or cascade-advanced)
- command (string, optional): defaults to "windsurf"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Runs are executed with: windsurf flow -p --output-format stream-json ...
- Prompts are piped to Windsurf via stdin.
- Sessions are resumed with --resume when stored session cwd matches current cwd.
- Paperclip auto-injects local skills into "~/.windsurf/skills" when missing, so Windsurf can discover "$paperclip" and related skills on local runs.
- Paperclip auto-adds --trust unless one of --trust/-f is already present in extraArgs.
`;
