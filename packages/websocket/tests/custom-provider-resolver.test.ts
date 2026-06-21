import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BaseProvider } from "@nodetool-ai/runtime";
import {
  customEndpointProviderId,
  customEndpointSecretKey,
  listCustomModelEndpoints
} from "../src/custom-model-endpoints.js";
import { resolveNodeToolProvider } from "../src/custom-provider-resolver.js";

const {
  agentConstructor,
  anthropicConstructor,
  fetchMock,
  lookupMock,
  openAIConstructor
} = vi.hoisted(() => ({
    agentConstructor: vi.fn(),
    anthropicConstructor: vi.fn(),
    fetchMock: vi.fn(),
    lookupMock: vi.fn(),
    openAIConstructor: vi.fn()
  }));

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock
}));

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

vi.mock("openai", () => ({
  default: openAIConstructor,
  toFile: vi.fn()
}));

vi.mock("undici", () => ({
  Agent: agentConstructor
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
    vi.stubGlobal("fetch", fetchMock);
    agentConstructor.mockImplementation(function AgentMock(options) {
      return { kind: "agent", options };
    });
    lookupMock.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
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
    vi.unstubAllGlobals();
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
        baseURL: "https://gateway.example.test/v1",
        fetch: expect.any(Function)
      }
    });
    await expect(provider.getAvailableLanguageModels()).resolves.toEqual([
      {
        id: "custom-chat",
        name: "Custom Chat",
        provider: customEndpointProviderId("case-sensitive_1")
      }
    ]);
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
        baseURL: "https://anthropic-gateway.example.test",
        fetch: expect.any(Function)
      }
    });
  });

  it("validates custom endpoint request destinations before SDK fetch", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint()
    ]);

    const provider = await resolveNodeToolProvider(
      "custom:case-sensitive_1",
      "user-1"
    );
    const client = (provider as { getClient: () => unknown }).getClient() as {
      args: { fetch: typeof fetch };
    };

    await client.args.fetch("https://gateway.example.test/v1/chat/completions");

    expect(lookupMock).toHaveBeenCalledWith("gateway.example.test", {
      all: true,
      verbatim: true
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.test/v1/chat/completions",
      expect.objectContaining({
        dispatcher: expect.objectContaining({ kind: "agent" }),
        redirect: "manual"
      })
    );
    const agent = agentConstructor.mock.results[0].value as {
      options: {
        connect: {
          lookup: (
            hostname: string,
            options: { all?: boolean },
            callback: (
              err: Error | null,
              address: string,
              family: number
            ) => void
          ) => void;
        };
      };
    };
    const callback = vi.fn();
    agent.options.connect.lookup("gateway.example.test", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "203.0.113.10", 4);
  });

  it("resolves IPv6 endpoint literals without URL brackets", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint({ baseUrl: "https://[2606:4700:4700::1111]/v1" })
    ]);
    lookupMock.mockResolvedValue([
      { address: "2606:4700:4700::1111", family: 6 }
    ]);

    const provider = await resolveNodeToolProvider(
      "custom:case-sensitive_1",
      "user-1"
    );
    const client = (provider as { getClient: () => unknown }).getClient() as {
      args: { fetch: typeof fetch };
    };

    await client.args.fetch("https://[2606:4700:4700::1111]/v1/chat/completions");

    expect(lookupMock).toHaveBeenCalledWith("2606:4700:4700::1111", {
      all: true,
      verbatim: true
    });
    const agent = agentConstructor.mock.results[0].value as {
      options: {
        connect: {
          lookup: (
            hostname: string,
            options: { all?: boolean },
            callback: (
              err: Error | null,
              address: string,
              family: number
            ) => void
          ) => void;
        };
      };
    };
    const callback = vi.fn();
    agent.options.connect.lookup("[2606:4700:4700::1111]", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "2606:4700:4700::1111", 6);
  });

  it("rejects custom endpoint requests that resolve to private addresses", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint()
    ]);
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    const provider = await resolveNodeToolProvider(
      "custom:case-sensitive_1",
      "user-1"
    );
    const client = (provider as { getClient: () => unknown }).getClient() as {
      args: { fetch: typeof fetch };
    };

    await expect(
      client.args.fetch("https://gateway.example.test/v1/chat/completions")
    ).rejects.toThrow(/private or link-local/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-host redirects from custom endpoint requests", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint()
    ]);
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://gateway-redirect.example.test/v1" }
      })
    );

    const provider = await resolveNodeToolProvider(
      "custom:case-sensitive_1",
      "user-1"
    );
    const client = (provider as { getClient: () => unknown }).getClient() as {
      args: { fetch: typeof fetch };
    };

    await expect(
      client.args.fetch("https://gateway.example.test/v1/chat/completions")
    ).rejects.toThrow(/cross-host redirects/i);
  });

  it("follows same-origin redirects from custom endpoint requests", async () => {
    (listCustomModelEndpoints as ReturnType<typeof vi.fn>).mockResolvedValue([
      endpoint()
    ]);
    const finalResponse = new Response("{}", { status: 200 });
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: "/v1/chat/completions/" }
        })
      )
      .mockResolvedValueOnce(finalResponse);

    const provider = await resolveNodeToolProvider(
      "custom:case-sensitive_1",
      "user-1"
    );
    const client = (provider as { getClient: () => unknown }).getClient() as {
      args: { fetch: typeof fetch };
    };

    await expect(
      client.args.fetch("https://gateway.example.test/v1/chat/completions")
    ).resolves.toBe(finalResponse);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://gateway.example.test/v1/chat/completions/",
      expect.objectContaining({ redirect: "manual" })
    );
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
