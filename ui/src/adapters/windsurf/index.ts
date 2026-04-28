import type { UIAdapterModule } from "../types";
import { parseWindsurfStdoutLine } from "@paperclipai/adapter-windsurf-local/ui";
import { WindsurfLocalConfigFields } from "./config-fields";
import { buildWindsurfLocalConfig } from "@paperclipai/adapter-windsurf-local/ui";

export const windsurfLocalUIAdapter: UIAdapterModule = {
  type: "windsurf",
  label: "Windsurf CLI (local)",
  parseStdoutLine: parseWindsurfStdoutLine,
  ConfigFields: WindsurfLocalConfigFields,
  buildAdapterConfig: buildWindsurfLocalConfig,
};
