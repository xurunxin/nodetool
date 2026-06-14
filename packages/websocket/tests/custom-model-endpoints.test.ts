import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  CUSTOM_MODEL_ENDPOINTS_SETTING,
  customEndpointProviderId,
  customEndpointSecretKey,
  deleteCustomModelEndpoint,
  listCustomModelEndpoints,
  upsertCustomModelEndpoint
} from "../src/custom-model-endpoints.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Setting: {
      find: vi.fn(),
      upsert: vi.fn()
    },
    Secret: {
      upsert: vi.fn(),
      deleteSecret: vi.fn()
    },
    clearSecretCache: vi.fn()
  };
});

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    clearProviderCache: vi.fn()
  };
});

import { Setting, Secret, clearSecretCache } from "@nodetool-ai/models";
import { clearProviderCache } from "@nodetool-ai/runtime";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

function makeSetting(value: unknown): { getValue: () => string } {
  return {
    getValue: vi.fn().mockReturnValue(JSON.stringify(value))
  };
}

function parseStoredEndpoints(): unknown {
  const calls = (Setting.upsert as ReturnType<typeof vi.fn>).mock.calls;
  const lastCall = calls.at(-1)?.[0] as { value: string } | undefined;
  expect(lastCall).toBeDefined();
  return JSON.parse(lastCall?.value ?? "null") as unknown;
}

describe("custom model endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses deterministic provider and secret identifiers", () => {
    expect(customEndpointProviderId("gateway")).toBe("custom:gateway");
    expect(customEndpointSecretKey("gateway")).toBe(
      "CUSTOM_MODEL_ENDPOINT_GATEWAY_API_KEY"
    );
  });

  it("lists valid endpoint metadata from settings", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([
        {
          id: "gateway",
          name: "Gateway",
          kind: "openai",
          baseUrl: "http://127.0.0.1:3000/v1",
          enabled: true,
          models: [{ id: "chat-test", name: "Chat Test" }],
          createdAt: "2026-06-14T08:00:00.000Z",
          updatedAt: "2026-06-14T08:00:00.000Z"
        }
      ])
    );

    const endpoints = await listCustomModelEndpoints("user-1");

    expect(Setting.find).toHaveBeenCalledWith(
      "user-1",
      CUSTOM_MODEL_ENDPOINTS_SETTING
    );
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].id).toBe("gateway");
  });

  it("upserts metadata and stores a new API key as a secret", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Secret.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const endpoint = await upsertCustomModelEndpoint("user-1", {
      id: "gateway",
      name: "Gateway",
      kind: "openai",
      baseUrl: "http://127.0.0.1:3000/v1",
      enabled: true,
      models: [{ id: "chat-test", name: "Chat Test" }],
      apiKey: "sk-test"
    });

    expect(endpoint.createdAt).toBe("2026-06-14T09:00:00.000Z");
    expect(Setting.upsert).toHaveBeenCalledWith({
      userId: "user-1",
      key: CUSTOM_MODEL_ENDPOINTS_SETTING,
      value: expect.any(String),
      description: "Custom OpenAI/Anthropic-compatible model endpoints"
    });
    expect(parseStoredEndpoints()).toEqual([endpoint]);
    expect(Secret.upsert).toHaveBeenCalledWith({
      userId: "user-1",
      key: "CUSTOM_MODEL_ENDPOINT_GATEWAY_API_KEY",
      value: "sk-test",
      description: "API key for custom model endpoint Gateway"
    });
    expect(clearSecretCache).toHaveBeenCalledWith(
      "user-1",
      "CUSTOM_MODEL_ENDPOINT_GATEWAY_API_KEY"
    );
    expect(clearProviderCache).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing secret when apiKey is a placeholder", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([
        {
          id: "gateway",
          name: "Old Gateway",
          kind: "openai",
          baseUrl: "http://127.0.0.1:3000/v1",
          enabled: true,
          models: [{ id: "chat-test", name: "Chat Test" }],
          createdAt: "2026-06-14T08:00:00.000Z",
          updatedAt: "2026-06-14T08:00:00.000Z"
        }
      ])
    );
    (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const endpoint = await upsertCustomModelEndpoint("user-1", {
      id: "gateway",
      name: "Gateway",
      kind: "openai",
      baseUrl: "http://127.0.0.1:3000/v1",
      enabled: true,
      models: [{ id: "chat-test", name: "Chat Test" }],
      apiKey: "****"
    });

    expect(endpoint.createdAt).toBe("2026-06-14T08:00:00.000Z");
    expect(Secret.upsert).not.toHaveBeenCalled();
    expect(clearSecretCache).not.toHaveBeenCalled();
    expect(clearProviderCache).toHaveBeenCalledTimes(1);
  });

  it("deletes endpoint metadata and removes the matching secret", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([
        {
          id: "gateway",
          name: "Gateway",
          kind: "openai",
          baseUrl: "http://127.0.0.1:3000/v1",
          enabled: true,
          models: [{ id: "chat-test", name: "Chat Test" }],
          createdAt: "2026-06-14T08:00:00.000Z",
          updatedAt: "2026-06-14T08:00:00.000Z"
        },
        {
          id: "claude_gateway",
          name: "Claude Gateway",
          kind: "anthropic",
          baseUrl: "https://example.test",
          enabled: true,
          models: [{ id: "claude-test", name: "Claude Test" }],
          createdAt: "2026-06-14T08:00:00.000Z",
          updatedAt: "2026-06-14T08:00:00.000Z"
        }
      ])
    );
    (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Secret.deleteSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      deleteCustomModelEndpoint("user-1", "gateway")
    ).resolves.toBe(true);

    expect(parseStoredEndpoints()).toEqual([
      expect.objectContaining({ id: "claude_gateway" })
    ]);
    expect(Secret.deleteSecret).toHaveBeenCalledWith(
      "user-1",
      "CUSTOM_MODEL_ENDPOINT_GATEWAY_API_KEY"
    );
    expect(clearSecretCache).toHaveBeenCalledWith(
      "user-1",
      "CUSTOM_MODEL_ENDPOINT_GATEWAY_API_KEY"
    );
    expect(clearProviderCache).toHaveBeenCalledTimes(1);
  });

  it("exposes list/upsert/delete through the protected tRPC router", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Secret.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const caller = createCaller(makeCtx());
    const upserted = await caller.customModelEndpoints.upsert({
      id: "gateway",
      name: "Gateway",
      kind: "openai",
      baseUrl: "http://127.0.0.1:3000/v1",
      enabled: true,
      models: [{ id: "chat-test", name: "Chat Test" }],
      apiKey: "sk-test"
    });

    expect(upserted.endpoint.id).toBe("gateway");
    expect(await caller.customModelEndpoints.list()).toEqual({
      endpoints: []
    });

    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([upserted.endpoint])
    );
    (Secret.deleteSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      caller.customModelEndpoints.delete({ id: "gateway" })
    ).resolves.toEqual({ deleted: true });
  });

  it("rejects unauthenticated tRPC callers", async () => {
    const caller = createCaller(makeCtx({ userId: null }));

    await expect(caller.customModelEndpoints.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
