import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  asStringArray,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_WINDSURF_LOCAL_MODEL } from "../index.js";
import { parseWindsurfJsonl } from "./parse.js";
import { hasWindsurfTrustBypassArg } from "../shared/trust.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function commandLooksLike(command: string, expected: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === expected || base === `${expected}.cmd` || base === `${expected}.exe`;
}

function summarizeProbeDetail(stdout: string, stderr: string, parsedError: string | null): string | null {
  const raw = parsedError?.trim() || firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const max = 240;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface WindsurfAuthInfo {
  email: string | null;
  displayName: string | null;
  userId: string | null;
}

export function windsurfConfigPath(windsurfHome?: string): string {
  return path.join(windsurfHome ?? path.join(os.homedir(), ".windsurf"), "auth.json");
}

export async function readWindsurfAuthInfo(windsurfHome?: string): Promise<WindsurfAuthInfo | null> {
  let raw: string;
  try {
    raw = await fs.readFile(windsurfConfigPath(windsurfHome), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const email = typeof obj.email === "string" && obj.email.trim().length > 0 ? obj.email.trim() : null;
  const displayName = typeof obj.displayName === "string" && obj.displayName.trim().length > 0 ? obj.displayName.trim() : null;
  const userId = typeof obj.userId === "string" && obj.userId.trim().length > 0 ? obj.userId.trim() : null;
  if (!email && !displayName && !userId) return null;
  return { email, displayName, userId };
}

const WINDSURF_AUTH_REQUIRED_RE =
  /(?:authentication\s+required|not\s+authenticated|not\s+logged\s+in|unauthorized|invalid(?:\s+or\s+missing)?\s+api(?:[_\s-]?key)?|windsurf[_\s-]?api[_\s-]?key|run\s+'?windsurf\s+login'?\s+first|api(?:[_\s-]?key)?(?:\s+is)?\s+required)/i;

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "windsurf");
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    checks.push({
      code: "windsurf_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "windsurf_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  try {
    await ensureCommandResolvable(command, cwd, runtimeEnv);
    checks.push({
      code: "windsurf_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "windsurf_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
    });
  }

  const configWindsurfApiKey = env.WINDSURF_API_KEY;
  const hostWindsurfApiKey = process.env.WINDSURF_API_KEY;
  if (isNonEmpty(configWindsurfApiKey) || isNonEmpty(hostWindsurfApiKey)) {
    const source = isNonEmpty(configWindsurfApiKey) ? "adapter config env" : "server environment";
    checks.push({
      code: "windsurf_api_key_present",
      level: "info",
      message: "WINDSURF_API_KEY is set for Windsurf authentication.",
      detail: `Detected in ${source}.`,
    });
  } else {
    const windsurfHome = isNonEmpty(env.WINDSURF_HOME) ? env.WINDSURF_HOME : undefined;
    const windsurfAuth = await readWindsurfAuthInfo(windsurfHome).catch(() => null);
    if (windsurfAuth) {
      checks.push({
        code: "windsurf_native_auth_present",
        level: "info",
        message: "Windsurf is authenticated via `windsurf login`.",
        detail: windsurfAuth.email
          ? `Logged in as ${windsurfAuth.email}.`
          : `Credentials found in ${windsurfConfigPath(windsurfHome)}.`,
      });
    } else {
      checks.push({
        code: "windsurf_api_key_missing",
        level: "warn",
        message: "WINDSURF_API_KEY is not set. Windsurf runs may fail until authentication is configured.",
        hint: "Set WINDSURF_API_KEY in adapter env or run `windsurf login`.",
      });
    }
  }

  const canRunProbe =
    checks.every((check) => check.code !== "windsurf_cwd_invalid" && check.code !== "windsurf_command_unresolvable");
  if (canRunProbe) {
    if (!commandLooksLike(command, "windsurf")) {
      checks.push({
        code: "windsurf_hello_probe_skipped_custom_command",
        level: "info",
        message: "Skipped hello probe because command is not `windsurf`.",
        detail: command,
        hint: "Use the `windsurf` CLI command to run the automatic installation and auth probe.",
      });
    } else {
      const model = asString(config.model, DEFAULT_WINDSURF_LOCAL_MODEL).trim();
      const extraArgs = (() => {
        const fromExtraArgs = asStringArray(config.extraArgs);
        if (fromExtraArgs.length > 0) return fromExtraArgs;
        return asStringArray(config.args);
      })();
      const autoTrustEnabled = !hasWindsurfTrustBypassArg(extraArgs);
      const args = ["flow", "-p", "--output-format", "json", "--workspace", cwd];
      if (model) args.push("--model", model);
      if (autoTrustEnabled) args.push("--trust");
      if (extraArgs.length > 0) args.push(...extraArgs);
      args.push("Respond with hello.");

      const probe = await runChildProcess(
        `windsurf-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: 45,
          graceSec: 5,
          onLog: async () => {},
        },
      );
      const parsed = parseWindsurfJsonl(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
      const authEvidence = `${parsed.errorMessage ?? ""}\n${probe.stdout}\n${probe.stderr}`.trim();

      if (probe.timedOut) {
        checks.push({
          code: "windsurf_hello_probe_timed_out",
          level: "warn",
          message: "Windsurf hello probe timed out.",
          hint: "Retry the probe. If this persists, verify `windsurf flow -p --output-format json \"Respond with hello.\"` manually.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        const summary = parsed.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "windsurf_hello_probe_passed" : "windsurf_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "Windsurf hello probe succeeded."
            : "Windsurf probe ran but did not return `hello` as expected.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
          ...(hasHello
            ? {}
            : {
                hint: "Try `windsurf flow -p --output-format json \"Respond with hello.\"` manually to inspect full output.",
              }),
        });
      } else if (WINDSURF_AUTH_REQUIRED_RE.test(authEvidence)) {
        checks.push({
          code: "windsurf_hello_probe_auth_required",
          level: "warn",
          message: "Windsurf CLI is installed, but authentication is not ready.",
          ...(detail ? { detail } : {}),
          hint: "Run `windsurf login` or configure WINDSURF_API_KEY in adapter env/shell, then retry the probe.",
        });
      } else {
        checks.push({
          code: "windsurf_hello_probe_failed",
          level: "error",
          message: "Windsurf hello probe failed.",
          ...(detail ? { detail } : {}),
          hint: "Run `windsurf flow -p --output-format json \"Respond with hello.\"` manually in this working directory to debug.",
        });
      }
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
