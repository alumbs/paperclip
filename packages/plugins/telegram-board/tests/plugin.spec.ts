import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Issue } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const companyId = "company-1";

function makeIssue(overrides: Partial<Issue>): Issue {
  const now = new Date("2026-05-21T12:00:00.000Z");
  return {
    id: "issue-1",
    companyId,
    identifier: "YOU-1",
    title: "Ship test work",
    description: null,
    status: "in_progress",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    projectId: null,
    goalId: null,
    parentId: null,
    originKind: "manual",
    originId: null,
    originRunId: null,
    checkoutRunId: null,
    checkoutAgentId: null,
    checkoutClaimedAt: null,
    workMode: "standard",
    blockerAttention: null,
    activeRecoveryAction: null,
    productivityReview: null,
    scheduledRetry: null,
    billingCode: null,
    requestDepth: null,
    assigneeAdapterOverrides: null,
    surfaceVisibility: "core",
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    executionState: null,
    executionPolicy: null,
    createdByAgentId: null,
    createdByUserId: null,
    updatedByAgentId: null,
    updatedByUserId: null,
    blockedBy: [],
    blocks: [],
    labelIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Issue;
}

describe("Telegram Board plugin", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("declares the scoped capabilities and webhook surface it uses", () => {
    expect(manifest.capabilities).toEqual(expect.arrayContaining([
      "webhooks.receive",
      "http.outbound",
      "secrets.read-ref",
      "issues.create",
      "issues.update",
      "events.subscribe",
    ]));
    expect(manifest.webhooks?.[0]?.endpointKey).toBe("telegram");
  });

  it("creates a Paperclip task from a Telegram /task update and ignores replayed updates", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyId,
        chatId: "12345",
        botTokenSecretRef: "telegram-bot-token",
        webhookSecretSecretRef: "telegram-webhook-secret",
      },
    });
    await plugin.definition.setup(harness.ctx);

    const input = {
      endpointKey: "telegram",
      requestId: "request-1",
      headers: { "x-telegram-bot-api-secret-token": "resolved:telegram-webhook-secret" },
      rawBody: "{}",
      parsedBody: {
        update_id: 9001,
        message: {
          text: "/task Follow up with prospect | Book discovery call next week",
          chat: { id: 12345 },
        },
      },
    };

    await plugin.definition.onWebhook?.(input);
    await plugin.definition.onWebhook?.({ ...input, requestId: "request-2" });

    const issues = await harness.ctx.issues.list({ companyId, limit: 10, offset: 0 });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.title).toBe("Follow up with prospect");
    expect(issues[0]?.description).toBe("Book discovery call next week");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://api.telegram.org/botresolved:telegram-bot-token/sendMessage");
  });

  it("sends one Telegram notification when an issue reaches done", async () => {
    const doneIssue = makeIssue({
      id: "done-issue",
      identifier: "YOU-7",
      status: "done",
      updatedAt: new Date("2026-05-21T13:00:00.000Z"),
    });
    const harness = createTestHarness({
      manifest,
      config: {
        companyId,
        chatId: "12345",
        botTokenSecretRef: "telegram-bot-token",
        publicBaseUrl: "https://paperclip.example",
      },
    });
    harness.seed({ issues: [doneIssue] });
    await plugin.definition.setup(harness.ctx);

    await harness.emit("issue.updated", { status: "done" }, {
      companyId,
      entityId: doneIssue.id,
      entityType: "issue",
    });
    await harness.emit("issue.updated", { status: "done" }, {
      companyId,
      entityId: doneIssue.id,
      entityType: "issue",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.text).toContain("Done in Paperclip");
    expect(body.text).toContain("YOU-7: Ship test work");
    expect(body.text).toContain("https://paperclip.example/YOU/issues/YOU-7");
  });

  it("routes approval decisions through the configured Paperclip API token secret", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        companyId,
        chatId: "12345",
        botTokenSecretRef: "telegram-bot-token",
        webhookSecretSecretRef: "telegram-webhook-secret",
        paperclipApiBaseUrl: "https://paperclip.example",
        paperclipApiTokenSecretRef: "paperclip-board-token",
      },
    });
    await plugin.definition.setup(harness.ctx);

    await plugin.definition.onWebhook?.({
      endpointKey: "telegram",
      requestId: "request-1",
      headers: { "x-telegram-bot-api-secret-token": "resolved:telegram-webhook-secret" },
      rawBody: "{}",
      parsedBody: {
        update_id: 9002,
        message: { text: "/approve approval-1 Looks good" },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://paperclip.example/api/approvals/approval-1/approve",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer resolved:paperclip-board-token" }),
      }),
    );
  });
});
