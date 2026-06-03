import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginEvent,
  type PluginWebhookInput,
} from "@paperclipai/plugin-sdk";
import type { Issue } from "@paperclipai/shared";

type TelegramBoardConfig = {
  companyId?: string;
  chatId?: string;
  botTokenSecretRef?: string;
  webhookSecretSecretRef?: string;
  publicBaseUrl?: string;
  paperclipApiBaseUrl?: string;
  paperclipApiTokenSecretRef?: string;
  defaultAssigneeAgentId?: string;
  defaultProjectId?: string;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number | string; title?: string; type?: string };
  from?: { id?: number; username?: string; first_name?: string; last_name?: string };
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

let currentContext: PluginContext | null = null;

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

async function getConfig(ctx: PluginContext): Promise<TelegramBoardConfig> {
  const raw = await ctx.config.get();
  return {
    companyId: textValue(raw.companyId),
    chatId: textValue(raw.chatId),
    botTokenSecretRef: textValue(raw.botTokenSecretRef),
    webhookSecretSecretRef: textValue(raw.webhookSecretSecretRef),
    publicBaseUrl: textValue(raw.publicBaseUrl)?.replace(/\/+$/, ""),
    paperclipApiBaseUrl: textValue(raw.paperclipApiBaseUrl)?.replace(/\/+$/, ""),
    paperclipApiTokenSecretRef: textValue(raw.paperclipApiTokenSecretRef),
    defaultAssigneeAgentId: textValue(raw.defaultAssigneeAgentId),
    defaultProjectId: textValue(raw.defaultProjectId),
  };
}

function configuredCompany(config: TelegramBoardConfig, eventCompanyId?: string): string | null {
  if (config.companyId) return config.companyId;
  return eventCompanyId ?? null;
}

function issueUrl(config: TelegramBoardConfig, issue: Issue): string {
  if (!config.publicBaseUrl || !issue.identifier) return "";
  return `${config.publicBaseUrl}/${issue.identifier.split("-")[0]}/issues/${issue.identifier}`;
}

function formatIssueLine(config: TelegramBoardConfig, issue: Issue): string {
  const url = issueUrl(config, issue);
  const suffix = url ? `\n${url}` : "";
  const label = issue.identifier ?? issue.id;
  return `${label}: ${issue.title}${suffix}`;
}

async function sendTelegramMessage(ctx: PluginContext, config: TelegramBoardConfig, text: string): Promise<void> {
  if (!config.chatId || !config.botTokenSecretRef) {
    ctx.logger.warn("Telegram chatId or bot token secret ref is not configured");
    return;
  }
  const token = await ctx.secrets.resolve(config.botTokenSecretRef);
  const response = await ctx.http.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed with ${response.status}: ${body.slice(0, 500)}`);
  }
}

function updateMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? update.channel_post ?? update.edited_message ?? update.edited_channel_post ?? null;
}

function parseTaskCommand(text: string): { title: string; description?: string } | null {
  const match = text.match(/^\/(?:task|new)(?:@\w+)?\s+([\s\S]+)$/i);
  if (!match) return null;
  const body = match[1]!.trim();
  if (!body) return null;
  const [firstLine, ...restLines] = body.split(/\r?\n/);
  const [titlePart, ...inlineDescriptionParts] = firstLine.split(/\s+\|\s+/);
  const title = titlePart.trim();
  const descriptionParts = [
    inlineDescriptionParts.join(" | ").trim(),
    restLines.join("\n").trim(),
  ].filter(Boolean);
  return title ? { title, description: descriptionParts.join("\n\n") || undefined } : null;
}

function parseDecisionCommand(text: string):
  | { kind: "approval"; action: "approve" | "reject" | "revise"; id: string; note?: string }
  | { kind: "interaction"; action: "accept" | "decline"; issueId: string; interactionId: string; note?: string }
  | { kind: "issueStatus"; action: "done" | "reopen"; issueId: string; note?: string }
  | null {
  const approval = text.match(/^\/(approve|reject|revise)(?:@\w+)?\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (approval) {
    return {
      kind: "approval",
      action: approval[1]!.toLowerCase() as "approve" | "reject" | "revise",
      id: approval[2]!,
      note: textValue(approval[3]),
    };
  }
  const interaction = text.match(/^\/(accept|decline)(?:@\w+)?\s+(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (interaction) {
    return {
      kind: "interaction",
      action: interaction[1]!.toLowerCase() as "accept" | "decline",
      issueId: interaction[2]!,
      interactionId: interaction[3]!,
      note: textValue(interaction[4]),
    };
  }
  const status = text.match(/^\/(done|reopen)(?:@\w+)?\s+(\S+)(?:\s+([\s\S]+))?$/i);
  if (status) {
    return {
      kind: "issueStatus",
      action: status[1]!.toLowerCase() as "done" | "reopen",
      issueId: status[2]!,
      note: textValue(status[3]),
    };
  }
  return null;
}

async function postPaperclipDecision(
  ctx: PluginContext,
  config: TelegramBoardConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (!config.paperclipApiBaseUrl || !config.paperclipApiTokenSecretRef) {
    throw new Error("paperclipApiBaseUrl and paperclipApiTokenSecretRef are required for approval and interaction decisions");
  }
  const token = await ctx.secrets.resolve(config.paperclipApiTokenSecretRef);
  const response = await ctx.http.fetch(`${config.paperclipApiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Paperclip decision request failed with ${response.status}: ${responseBody.slice(0, 500)}`);
  }
}

async function handleDecisionCommand(
  ctx: PluginContext,
  config: TelegramBoardConfig,
  command: NonNullable<ReturnType<typeof parseDecisionCommand>>,
): Promise<string> {
  const companyId = configuredCompany(config);
  if (command.kind === "approval") {
    const actionPath = command.action === "revise" ? "request-revision" : command.action;
    await postPaperclipDecision(ctx, config, `/api/approvals/${command.id}/${actionPath}`, {
      decisionNote: command.note,
    });
    return `Recorded ${command.action} for approval ${command.id}.`;
  }
  if (command.kind === "interaction") {
    const actionPath = command.action === "decline" ? "reject" : "accept";
    const body = command.action === "decline"
      ? { rejectionReason: command.note ?? "Rejected from Telegram" }
      : { response: command.note ?? null };
    await postPaperclipDecision(
      ctx,
      config,
      `/api/issues/${command.issueId}/interactions/${command.interactionId}/${actionPath}`,
      body,
    );
    return `Recorded ${command.action} for interaction ${command.interactionId}.`;
  }
  if (!companyId) throw new Error("companyId is required for /done and /reopen");
  const status = command.action === "done" ? "done" : "in_progress";
  const issue = await ctx.issues.update(command.issueId, { status }, companyId);
  if (command.note) {
    await ctx.issues.createComment(command.issueId, `Telegram decision note:\n\n${command.note}`, companyId);
  }
  return `Updated ${issue.identifier} to ${issue.status}.`;
}

async function rememberUpdate(ctx: PluginContext, updateId: number): Promise<boolean> {
  const stateKey = `telegram-update:${updateId}`;
  const existing = await ctx.state.get({ scopeKind: "instance", namespace: "telegram", stateKey });
  if (existing) return false;
  await ctx.state.set({ scopeKind: "instance", namespace: "telegram", stateKey }, {
    handledAt: new Date().toISOString(),
  });
  return true;
}

async function handleTelegramText(ctx: PluginContext, config: TelegramBoardConfig, text: string): Promise<string | null> {
  const task = parseTaskCommand(text);
  if (task) {
    const companyId = configuredCompany(config);
    if (!companyId) throw new Error("companyId is required to create Telegram tasks");
    const issue = await ctx.issues.create({
      companyId,
      projectId: config.defaultProjectId,
      assigneeAgentId: config.defaultAssigneeAgentId,
      title: task.title,
      description: task.description,
      originKind: `plugin:${ctx.manifest.id}:telegram`,
      originId: `telegram:${Date.now()}`,
    });
    return `Created ${formatIssueLine(config, issue)}`;
  }
  const decision = parseDecisionCommand(text);
  if (decision) {
    return await handleDecisionCommand(ctx, config, decision);
  }
  if (/^\/help(?:@\w+)?$/i.test(text.trim())) {
    return [
      "Paperclip Telegram commands:",
      "/task Title | optional description",
      "/task Title on first line, description on later lines",
      "/done <issueId> [note]",
      "/reopen <issueId> [note]",
      "/approve <approvalId> [note]",
      "/reject <approvalId> [note]",
      "/revise <approvalId> [note]",
      "/accept <issueId> <interactionId> [note]",
      "/decline <issueId> <interactionId> [reason]",
    ].join("\n");
  }
  return null;
}

async function notifyDoneIssue(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const config = await getConfig(ctx);
  const companyId = configuredCompany(config, event.companyId);
  if (!companyId || event.companyId !== companyId || !event.entityId) return;
  const issue = await ctx.issues.get(event.entityId, companyId);
  if (!issue || issue.status !== "done") return;
  const stateKey = `done-notified:${issue.id}`;
  const existing = await ctx.state.get({ scopeKind: "company", scopeId: companyId, namespace: "telegram", stateKey });
  if (existing === issue.updatedAt.toISOString()) return;
  await ctx.state.set(
    { scopeKind: "company", scopeId: companyId, namespace: "telegram", stateKey },
    issue.updatedAt.toISOString(),
  );
  await sendTelegramMessage(ctx, config, `Done in Paperclip:\n${formatIssueLine(config, issue)}`);
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    ctx.events.on("issue.updated", async (event) => {
      await notifyDoneIssue(ctx, event);
    });

    ctx.data.register("health", async () => {
      const config = await getConfig(ctx);
      return {
        status: "ok",
        checkedAt: new Date().toISOString(),
        configured: Boolean(config.companyId && config.chatId && config.botTokenSecretRef),
      };
    });

    ctx.actions.register("parse-command", async (params) => {
      const text = typeof params.text === "string" ? params.text : "";
      return {
        task: parseTaskCommand(text),
        decision: parseDecisionCommand(text),
      };
    });
  },

  async onHealth() {
    const ctx = currentContext;
    const config = ctx ? await getConfig(ctx) : {};
    return {
      status: config.companyId && config.chatId && config.botTokenSecretRef ? "ok" : "degraded",
      message: "Telegram Board plugin worker is running",
      details: {
        companyConfigured: Boolean(config.companyId),
        chatConfigured: Boolean(config.chatId),
        botTokenSecretConfigured: Boolean(config.botTokenSecretRef),
        decisionApiConfigured: Boolean(config.paperclipApiBaseUrl && config.paperclipApiTokenSecretRef),
      },
    };
  },

  async onValidateConfig(config) {
    const typed = config as TelegramBoardConfig;
    const warnings: string[] = [];
    const errors: string[] = [];
    if (typed.botTokenSecretRef && !typed.chatId) warnings.push("chatId is required before Telegram notifications can be sent.");
    if (typed.paperclipApiBaseUrl && !typed.paperclipApiTokenSecretRef) {
      warnings.push("paperclipApiTokenSecretRef is required before approval and interaction decision commands can be used.");
    }
    if (typed.publicBaseUrl && !/^https?:\/\//i.test(typed.publicBaseUrl)) errors.push("publicBaseUrl must be an http(s) URL.");
    if (typed.paperclipApiBaseUrl && !/^https?:\/\//i.test(typed.paperclipApiBaseUrl)) {
      errors.push("paperclipApiBaseUrl must be an http(s) URL.");
    }
    return { ok: errors.length === 0, warnings, errors };
  },

  async onWebhook(input: PluginWebhookInput) {
    if (input.endpointKey !== "telegram") throw new Error(`Unsupported webhook endpoint: ${input.endpointKey}`);
    const ctx = currentContext;
    if (!ctx) throw new Error("Plugin context is not initialized");
    const config = await getConfig(ctx);
    if (config.webhookSecretSecretRef) {
      const expected = await ctx.secrets.resolve(config.webhookSecretSecretRef);
      const actual = input.headers["x-telegram-bot-api-secret-token"];
      const actualValue = Array.isArray(actual) ? actual[0] : actual;
      if (actualValue !== expected) throw new Error("Invalid Telegram webhook secret token");
    }
    const update = input.parsedBody as TelegramUpdate | undefined;
    if (!update || typeof update !== "object") throw new Error("Telegram update body must be a JSON object");
    if (typeof update.update_id === "number") {
      const firstDelivery = await rememberUpdate(ctx, update.update_id);
      if (!firstDelivery) return;
    }
    const message = updateMessage(update);
    const text = message?.text?.trim();
    if (!text) return;
    const reply = await handleTelegramText(ctx, config, text);
    if (reply) await sendTelegramMessage(ctx, config, reply);
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
