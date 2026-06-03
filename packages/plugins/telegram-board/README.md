# Telegram Board

Telegram notifications, task creation, and task decisions for Paperclip.

## Development

```bash
pnpm install
pnpm dev            # watch builds
pnpm dev:ui         # local dev server with hot-reload events
pnpm test
```

`pnpm dev` rebuilds the worker, manifest, and UI bundles into `dist/`.
When this package is installed from a local path, Paperclip watches that rebuilt
output and reloads the plugin worker. Local installs run trusted code from this
folder on your machine.

## Configuration

Configure these values in the plugin settings UI. Store all tokens as Paperclip
secrets and enter only secret references here.

- `companyId`: company that receives Telegram-created tasks and done-work notifications.
- `chatId`: Telegram chat or channel ID that receives replies and notifications.
- `botTokenSecretRef`: secret reference for the Telegram bot token.
- `webhookSecretSecretRef`: optional secret reference for Telegram's webhook secret token.
- `publicBaseUrl`: optional Paperclip URL used in notification links.
- `paperclipApiBaseUrl` and `paperclipApiTokenSecretRef`: optional Paperclip API credentials for `/approve`, `/reject`, `/revise`, `/accept`, and `/decline`.
- `defaultAssigneeAgentId` and `defaultProjectId`: optional defaults for tasks created from Telegram.

Set the Telegram webhook to:

```text
POST /api/plugins/paperclip.telegram-board/webhooks/telegram
```

Use Telegram's `secret_token` webhook option when `webhookSecretSecretRef` is
configured. The plugin compares that header with the resolved secret value.

## Telegram Commands

```text
/task Title | optional description
/task Title on first line
description on later lines
/done <issueId> [note]
/reopen <issueId> [note]
/approve <approvalId> [note]
/reject <approvalId> [note]
/revise <approvalId> [note]
/accept <issueId> <interactionId> [note]
/decline <issueId> <interactionId> [reason]
```

Webhook `update_id` values are stored in plugin state so repeated Telegram
deliveries are ignored after the first successful handling.



## Install Into Paperclip

```bash
paperclipai plugin install C:/Users/chibuzor.alumba/CascadeProjects/paperclip/packages/plugins/telegram-board
```

## Build Options

- `pnpm build` uses esbuild presets from `@paperclipai/plugin-sdk/bundlers`.
- `pnpm build:rollup` uses rollup presets from the same SDK.
