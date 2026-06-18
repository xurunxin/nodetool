import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BaseProvider } from "@nodetool-ai/runtime";
import {
  customEndpointProviderId,
  customEndpointSecretKey,
  listCustomModelEndpoints
} from "../src/custom-model-endpoints.js";
import { resolveNodeToolProvider } from "../src/custom-provider-resolver.js";

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  const sourceAnthropic = await import(
    "../../runtime/src/providers/anthropic-provider.js"
  );
  return {
    ...actual,
    AnthropicProvider: sourceAnthropic.AnthropicProvider,
    getProvider: vi.fn()
  };
});

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    getSecret: vi.fn()
  };
});

vi.mock("../src/custom-model-endpoints.js", async (orig) => {
  const actual = await orig<typeof import("../src/custom-model-endpoints.js")>();
  return {
    ...actual,
    listCustomModelEndpoints: vi.fn()
  };
});

const { anthropicConstructor, openAIConstructor } = vi.hoisted(() => ({
  anthropicConstructor: vi.fn(),
  openAIConstructor: vi.fn()
}));

vi.mock("openai", () => ({
  default: openAIConstructor,
  toFile: vi.fn()
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: anthropicConstructor
}));

import { getProvider } from "@nodetool-ai/runtime";
import { getSecret } from "@nodetool-ai/models";

function endpoint(
  overrides: Partial<{
    id: string;
    name: string;
    kind: "openai" | "anthropic";
    baseUrl: string;
    enabled: boolean;
  }> = {}
) {
  return {
    id: "case-sensitive_1",
    name: "Case Sensitive",
    kind: "openai" as const,
    baseUrl: "https://gateway.example.test/v1",
    enabled: true,
    models: [{ id: "custom-chat", name: "Custom Chat" }],
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...overrides
  };
}

describe("resolveNodeToolProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openAIConstructor.mockImplementation(function OpenAIMock(args) {
      return { kind: "openai", args };
    });
    anthropicConstructor.mockImplementation(function AnthropicMock(args) {
      return {
        kind: "anthropic",
        args
      };
    });
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue("db-secret");
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates non-custom providers to runtime getProvider with lowercased id and DB-backed secret resolver", async () => {
    const resolvedProvider = { provider: "openai" } as BaseProvider;
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        _providerId: string,
        resolveSecret: (key: string) => Promise<string | undefined>
      ) => {
        await expect(resolveSecret("OPENAI_API_KEY")).resolves.toBe("db-secret");
        return resolvedProvider;
      }
    );

    await expect(
      resolveNodeToolProvider("OpenAI", "user-1")
    ).resolves.toBe(resolvedProvider);

    expect(getProvider).toHaveBeenCalledWith("openai", expect.any(Function));
    expect(getSecret).toHaveBeenCalledWith("OPENAI_API_KEY", "user-1");
  });

  it("resolves an enabled custom OpenAI-compatible endpoint with its custom provider id", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint()
    ]);

    const provider = await resolveNodeToolProvider(
      "custom:case-sensitive_1",
      "user-1"
    );

    expect(provider.provider).toBe(customEndpointProviderId("case-sensitive_1"));
    expect(getSecret).toHaveBeenCalledWith(
      customEndpointSecretKey("case-sensitive_1"),
      "user-1"
    );

    const client = (provider as { getClient: () => unknown }).getClient();
    expect(client).toEqual({
      kind: "openai",
      args: {
        apiKey: "db-secret",
        baseURL: "https://gateway.example.test/v1"
      }
    });
  });

  it("resolves an enabled custom Anthropic-compatible endpoint with its custom provider id", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint({
        kind: "anthropic",
        baseUrl: "https://anthropic-gateway.example.test"
      })
    ]);

    const provider = await resolveNodeToolProvider(
      "custom:case-sensitive_1",
      "user-1"
    );

    expect(provider.provider).toBe(customEndpointProviderId("case-sensitive_1"));

    const client = (provider as { getClient: () => unknown }).getClient();
    expect(client).toEqual({
      kind: "anthropic",
      args: {
        apiKey: "db-secret",
        baseURL: "https://anthropic-gateway.example.test"
      }
    });
  });

  it.each([
    ["missing", []],
    ["disabled", [endpoint({ enabled: false })]]
  ])("rejects a %s custom endpoint", async (_case, endpoints) => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue(
      endpoints
    );

    await expect(
      resolveNodeToolProvider("custom:case-sensitive_1", "user-1")
    ).rejects.toThrow(/custom model endpoint/i);
  });

  it("rejects a custom endpoint with no stored API key", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint()
    ]);
    (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      resolveNodeToolProvider("custom:case-sensitive_1", "user-1")
    ).rejects.toThrow(/api key/i);
  });
});
