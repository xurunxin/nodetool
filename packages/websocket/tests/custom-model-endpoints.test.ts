import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

import { Setting, Secret, clearSecretCache } from "@nodetool-ai/models";

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

function makeStoredSetting(value: unknown): { getValue: () => string } {
  return {
    getValue: () => JSON.stringify(value)
  };
}

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "alpha_gateway",
    name: "Alpha Gateway",
    kind: "openai",
    baseUrl: "https://alpha.example.test/v1",
    enabled: true,
    models: [{ id: "alpha-chat", name: "Alpha Chat" }],
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides
  };
}

describe("custom model endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty list when no setting exists", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(listCustomModelEndpoints("user-1")).resolves.toEqual([]);
  });

  it("parses stored endpoint metadata", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStoredSetting([endpoint()])
    );

    await expect(listCustomModelEndpoints("user-1")).resolves.toEqual([
      endpoint()
    ]);
  });

  it("fails loudly when stored endpoint metadata is malformed", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue({
      getValue: () => "{bad json"
    });

    await expect(listCustomModelEndpoints("user-1")).rejects.toThrow();
  });

  it("fails loudly when stored endpoint metadata is schema-invalid", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStoredSetting([endpoint({ models: [] })])
    );

    await expect(listCustomModelEndpoints("user-1")).rejects.toThrow();
  });

  it("uses safe deterministic provider and secret identifiers", () => {
    expect(customEndpointProviderId("local-gateway_1")).toBe(
      "custom:local-gateway_1"
    );
    expect(customEndpointSecretKey("local-gateway_1")).toBe(
      "CUSTOM_MODEL_ENDPOINT_LOCAL_GATEWAY_1_API_KEY"
    );
  });

  it("upserts metadata, stores a real api key, clears cache, preserves creation time, and sorts by name", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStoredSetting([
        endpoint({
          id: "zulu_gateway",
          name: "Zulu Gateway"
        }),
        endpoint({
          id: "beta_gateway",
          name: "Beta Gateway",
          createdAt: "2026-06-13T00:00:00.000Z",
          updatedAt: "2026-06-13T00:00:00.000Z"
        })
      ])
    );
    (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Secret.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await upsertCustomModelEndpoint("user-1", {
      id: "beta_gateway",
      name: "Aardvark Gateway",
      kind: "anthropic",
      baseUrl: "https://beta.example.test",
      enabled: false,
      models: [{ id: "claude-test", name: "Claude Test" }],
      apiKey: "sk-real"
    });

    expect(result.createdAt).toBe("2026-06-13T00:00:00.000Z");
    expect(result.updatedAt).not.toBe(result.createdAt);
    expect(Setting.upsert).toHaveBeenCalledWith({
      userId: "user-1",
      key: CUSTOM_MODEL_ENDPOINTS_SETTING,
      value: expect.any(String),
      description: "Custom OpenAI/Anthropic-compatible model endpoints"
    });
    const savedValue = JSON.parse(
      (Setting.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0].value
    ) as Array<{ name: string; id: string; createdAt: string }>;
    expect(savedValue.map((item) => item.name)).toEqual([
      "Aardvark Gateway",
      "Zulu Gateway"
    ]);
    expect(savedValue[0]).toMatchObject({
      id: "beta_gateway",
      createdAt: "2026-06-13T00:00:00.000Z"
    });
    expect(Secret.upsert).toHaveBeenCalledWith({
      userId: "user-1",
      key: "CUSTOM_MODEL_ENDPOINT_BETA_GATEWAY_API_KEY",
      value: "sk-real",
      description: "API key for custom model endpoint Aardvark Gateway"
    });
    expect(clearSecretCache).toHaveBeenCalledWith(
      "user-1",
      "CUSTOM_MODEL_ENDPOINT_BETA_GATEWAY_API_KEY"
    );
  });

  it("skips secret upsert for the placeholder api key", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStoredSetting([endpoint()])
    );
    (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await upsertCustomModelEndpoint("user-1", {
      id: "alpha_gateway",
      name: "Alpha Gateway",
      kind: "openai",
      baseUrl: "https://alpha.example.test/v1",
      enabled: true,
      models: [{ id: "alpha-chat", name: "Alpha Chat" }],
      apiKey: "****"
    });

    expect(Secret.upsert).not.toHaveBeenCalled();
    expect(clearSecretCache).not.toHaveBeenCalled();
  });

  it("deletes metadata and deterministic secret when an endpoint exists", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStoredSetting([
        endpoint({ id: "alpha_gateway", name: "Alpha Gateway" }),
        endpoint({ id: "beta-gateway", name: "Beta Gateway" })
      ])
    );
    (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Secret.deleteSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      deleteCustomModelEndpoint("user-1", "beta-gateway")
    ).resolves.toBe(true);

    const savedValue = JSON.parse(
      (Setting.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0].value
    ) as Array<{ id: string }>;
    expect(savedValue.map((item) => item.id)).toEqual(["alpha_gateway"]);
    expect(Secret.deleteSecret).toHaveBeenCalledWith(
      "user-1",
      "CUSTOM_MODEL_ENDPOINT_BETA_GATEWAY_API_KEY"
    );
    expect(clearSecretCache).toHaveBeenCalledWith(
      "user-1",
      "CUSTOM_MODEL_ENDPOINT_BETA_GATEWAY_API_KEY"
    );
  });

  it("returns false without deleting a secret when the endpoint is missing", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStoredSetting([endpoint()])
    );

    await expect(
      deleteCustomModelEndpoint("user-1", "missing_gateway")
    ).resolves.toBe(false);

    expect(Setting.upsert).not.toHaveBeenCalled();
    expect(Secret.deleteSecret).not.toHaveBeenCalled();
    expect(clearSecretCache).not.toHaveBeenCalled();
  });

  describe("router", () => {
    it("lists endpoints for authenticated callers", async () => {
      (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStoredSetting([endpoint()])
      );

      const caller = createCaller(makeCtx());
      await expect(caller.customModelEndpoints.list()).resolves.toEqual({
        endpoints: [endpoint()]
      });
    });

    it("upserts endpoints for authenticated callers", async () => {
      (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const caller = createCaller(makeCtx());
      const result = await caller.customModelEndpoints.upsert({
        id: "alpha_gateway",
        name: "Alpha Gateway",
        kind: "openai",
        baseUrl: "https://alpha.example.test/v1",
        enabled: true,
        models: [{ id: "alpha-chat", name: "Alpha Chat" }]
      });

      expect(result.endpoint.id).toBe("alpha_gateway");
      expect(Setting.upsert).toHaveBeenCalledTimes(1);
    });

    it("deletes endpoints for authenticated callers", async () => {
      (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeStoredSetting([endpoint()])
      );
      (Setting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (Secret.deleteSecret as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const caller = createCaller(makeCtx());
      await expect(
        caller.customModelEndpoints.delete({ id: "alpha_gateway" })
      ).resolves.toEqual({ deleted: true });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));

      await expect(caller.customModelEndpoints.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
      await expect(
        caller.customModelEndpoints.upsert({
          id: "alpha_gateway",
          name: "Alpha Gateway",
          kind: "openai",
          baseUrl: "https://alpha.example.test/v1",
          enabled: true,
          models: [{ id: "alpha-chat", name: "Alpha Chat" }]
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        caller.customModelEndpoints.delete({ id: "alpha_gateway" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
