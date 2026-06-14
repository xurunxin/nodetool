import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { resolveNodeToolProvider } from "../src/custom-provider-resolver.js";

vi.mock("openai", () => ({
  default: vi.fn(function MockOpenAI(options: unknown) {
    return {
      provider: "openai-client",
      options
    };
  })
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function MockAnthropic(options: unknown) {
    return {
      provider: "anthropic-client",
      options
    };
  })
}));

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: vi.fn()
  };
});

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Setting: {
      find: vi.fn()
    },
    getSecret: vi.fn()
  };
});

import { getProvider } from "@nodetool-ai/runtime";
import { Setting, getSecret } from "@nodetool-ai/models";

function makeSetting(value: unknown): { getValue: () => string } {
  return {
    getValue: vi.fn().mockReturnValue(JSON.stringify(value))
  };
}

function mockCustomEndpoint(
  overrides: Partial<{
    id: string;
    name: string;
    kind: "openai" | "anthropic";
    baseUrl: string;
    enabled: boolean;
    modelId: string;
  }> = {}
) {
  const id = overrides.id ?? "gateway";
  const name = overrides.name ?? "Gateway";
  return {
    id,
    name,
    kind: overrides.kind ?? "openai",
    baseUrl: overrides.baseUrl ?? "http://127.0.0.1:3000/v1",
    enabled: overrides.enabled ?? true,
    models: [
      {
        id: overrides.modelId ?? "chat-test",
        name: "Chat Test"
      }
    ],
    createdAt: "2026-06-14T08:00:00.000Z",
    updatedAt: "2026-06-14T08:00:00.000Z"
  };
}

describe("custom provider resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates non-custom providers to the runtime provider registry", async () => {
    const provider = { provider: "openai" };
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(provider);

    await expect(
      resolveNodeToolProvider("OpenAI", "user-1")
    ).resolves.toBe(provider);

    expect(getProvider).toHaveBeenCalledWith("openai", expect.any(Function));
  });

  it("resolves an OpenAI-compatible endpoint with a custom base URL", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([
        mockCustomEndpoint({
          id: "gateway",
          kind: "openai",
          baseUrl: "http://127.0.0.1:3000/v1"
        })
      ])
    );
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue("sk-custom");

    const provider = await resolveNodeToolProvider("custom:gateway", "user-1");

    expect(provider.provider).toBe("custom:gateway");
    expect((provider as { apiKey: string }).apiKey).toBe("sk-custom");
    (provider as { getClient: () => unknown }).getClient();
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: "sk-custom",
      baseURL: "http://127.0.0.1:3000/v1"
    });
    expect(getSecret).toHaveBeenCalledWith(
      "CUSTOM_MODEL_ENDPOINT_GATEWAY_API_KEY",
      "user-1"
    );
  });

  it("resolves an Anthropic-compatible endpoint with a custom base URL", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([
        mockCustomEndpoint({
          id: "claude_gateway",
          kind: "anthropic",
          baseUrl: "https://anthropic-compatible.test"
        })
      ])
    );
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue("sk-ant-custom");

    const provider = await resolveNodeToolProvider(
      "custom:claude_gateway",
      "user-1"
    );

    expect(provider.provider).toBe("custom:claude_gateway");
    expect((provider as { apiKey: string }).apiKey).toBe("sk-ant-custom");
    (provider as { getClient: () => unknown }).getClient();
    expect(Anthropic).toHaveBeenCalledWith({
      apiKey: "sk-ant-custom",
      baseURL: "https://anthropic-compatible.test"
    });
  });

  it("rejects disabled custom endpoints", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([mockCustomEndpoint({ enabled: false })])
    );

    await expect(
      resolveNodeToolProvider("custom:gateway", "user-1")
    ).rejects.toThrow('Custom model endpoint "gateway" is not configured');
  });

  it("rejects custom endpoints with no stored API key", async () => {
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSetting([mockCustomEndpoint()])
    );
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      resolveNodeToolProvider("custom:gateway", "user-1")
    ).rejects.toThrow(
      'API key for custom model endpoint "gateway" is missing'
    );
  });
});
