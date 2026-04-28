import type { UIAdapterModule } from "../types";

function parseHumanStdoutLine(line: string, ts: string) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  return [{ kind: "stdout" as const, ts, text: trimmed }];
}

function buildHumanConfig(): Record<string, unknown> {
  return {};
}

function HumanConfigFields() {
  return null;
}

export const humanUIAdapter: UIAdapterModule = {
  type: "human",
  label: "Human / MCP",
  parseStdoutLine: parseHumanStdoutLine,
  ConfigFields: HumanConfigFields,
  buildAdapterConfig: buildHumanConfig,
};
