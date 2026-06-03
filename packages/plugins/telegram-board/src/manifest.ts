import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip.telegram-board",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Telegram Board",
  description: "Telegram notifications, task creation, and task decisions for Paperclip.",
  author: "Paperclip",
  categories: ["connector"],
  capabilities: [
    "http.outbound",
    "secrets.read-ref",
    "events.subscribe",
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.create",
    "plugin.state.read",
    "plugin.state.write",
    "webhooks.receive",
    "instance.settings.register",
    "ui.dashboardWidget.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      companyId: {
        type: "string",
        title: "Paperclip company ID",
        description: "Only events from this company are sent to Telegram. Incoming task commands create work in this company."
      },
      chatId: {
        type: "string",
        title: "Telegram chat ID",
        description: "Destination chat or channel ID for Paperclip notifications."
      },
      botTokenSecretRef: {
        type: "string",
        title: "Telegram bot token secret ref",
        description: "Secret reference for the Telegram bot token. Do not paste the token itself into source."
      },
      webhookSecretSecretRef: {
        type: "string",
        title: "Telegram webhook secret token ref",
        description: "Secret reference whose value must match Telegram's X-Telegram-Bot-Api-Secret-Token header."
      },
      publicBaseUrl: {
        type: "string",
        title: "Paperclip public base URL",
        description: "Optional base URL used to include clickable Paperclip links in Telegram messages."
      },
      paperclipApiBaseUrl: {
        type: "string",
        title: "Paperclip API base URL",
        description: "Optional API origin used for Telegram approval and interaction decision commands."
      },
      paperclipApiTokenSecretRef: {
        type: "string",
        title: "Paperclip API token secret ref",
        description: "Optional secret reference for a board-capable Paperclip API token used by /approve, /reject, /accept, and /decline."
      },
      defaultAssigneeAgentId: {
        type: "string",
        title: "Default assignee agent ID",
        description: "Optional agent assigned to tasks created from Telegram."
      },
      defaultProjectId: {
        type: "string",
        title: "Default project ID",
        description: "Optional project for tasks created from Telegram."
      }
    }
  },
  webhooks: [
    {
      endpointKey: "telegram",
      displayName: "Telegram Updates",
      description: "Receives Telegram bot webhook updates for task creation and decisions."
    }
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "health-widget",
        displayName: "Telegram Board Health",
        exportName: "DashboardWidget"
      }
    ]
  }
};

export default manifest;
