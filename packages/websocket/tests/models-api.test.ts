import { access, readdir } from "node:fs/promises";
import { getSecret } from "@nodetool-ai/models";
import {
  BaseProvider,
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
  type LanguageModel,
  type ProviderId
} from "@nodetool-ai/runtime";
import { readCachedHfModels } from "@nodetool-ai/huggingface";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleModelsApiRequest } from "../src/models-api.js";

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    listRegisteredProviderIds: vi.fn(),
    isProviderConfigured: vi.fn(),
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

vi.mock("@nodetool-ai/huggingface", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/huggingface")>();
  return {
    ...actual,
    readCachedHfModels: vi.fn()
  };
});

vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn(),
    readdir: vi.fn()
  };
});

const LOCAL_PROVIDER_IDS: ProviderId[] = [
  "ollama",
  "lmstudio",
  "llama_cpp",
  "vllm",
  "transformers_js"
];

const originalModelSurface = process.env.NODETOOL_MODEL_SURFACE;

class TestProvider extends BaseProvider {
  readonly languageModels: LanguageModel[];

  constructor(provider: ProviderId) {
    super(provider);
    this.languageModels = [
      {
        id: `${provider}-model`,
        name: `${provider} Model`,
        provider
      }
    ];
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.languageModels;
  }
}

function resetModelSurface(): void {
  if (originalModelSurface == null) {
    delete process.env.NODETOOL_MODEL_SURFACE;
    return;
  }
  process.env.NODETOOL_MODEL_SURFACE = originalModelSurface;
}

function enableLocalModelSurface(): void {
  process.env.NODETOOL_MODEL_SURFACE = "local_first";
}

async function requestJson(
  path: string,
  init: RequestInit = {}
): Promise<{ body: unknown; status: number }> {
  const response = await handleModelsApiRequest(
    new Request(`http://localhost${path}`, init)
  );
  if (!response) {
    throw new Error(`Expected REST models API response for ${path}`);
  }
  return {
    body: await response.json(),
    status: response.status
  };
}

function modelProviders(models: UnifiedModel[]): Set<string> {
  return new Set(
    models
      .map((model) => model.provider)
      .filter((provider): provider is string => provider != null)
  );
}

describe("REST models API surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODETOOL_MODEL_SURFACE;
    vi.mocked(listRegisteredProviderIds).mockReturnValue([]);
    vi.mocked(isProviderConfigured).mockResolvedValue(false);
    vi.mocked(getProvider).mockImplementation(
      async (provider) => new TestProvider(provider)
    );
    vi.mocked(getSecret).mockResolvedValue(null);
    vi.mocked(readCachedHfModels).mockResolvedValue([]);
    vi.mocked(access).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    vi.mocked(readdir).mockResolvedValue([]);
  });

  afterEach(() => {
    resetModelSurface();
    vi.restoreAllMocks();
  });

  it("hides local-only providers and keeps hosted providers", async () => {
    vi.mocked(listRegisteredProviderIds).mockReturnValue([
      "openai",
      "anthropic",
      ...LOCAL_PROVIDER_IDS
    ]);
    vi.mocked(isProviderConfigured).mockResolvedValue(true);

    const { body, status } = await requestJson("/api/models/providers");

    expect(status).toBe(200);
    expect(
      (body as Array<{ provider: string }>).map((entry) => entry.provider)
    ).toEqual(["openai", "anthropic"]);
    expect(getProvider).toHaveBeenCalledTimes(2);
    expect(getProvider).not.toHaveBeenCalledWith(
      expect.stringMatching(/^(ollama|lmstudio|llama_cpp|vllm|transformers_js)$/),
      expect.any(Function)
    );
  });

  it("does not include cached HuggingFace entries when API-first mode is unset", async () => {
    vi.mocked(readCachedHfModels).mockResolvedValue([
      {
        id: "cached-hf",
        name: "Cached HF",
        type: "language_model",
        repo_id: "user/cached-hf",
        path: null,
        downloaded: true,
        tags: []
      }
    ]);

    const { body, status } = await requestJson("/api/models");
    const models = body as UnifiedModel[];

    expect(status).toBe(200);
    expect(models.map((model) => model.id)).not.toContain("cached-hf");
    expect(readCachedHfModels).not.toHaveBeenCalled();
  });

  it("restores local provider visibility in local-first mode", async () => {
    enableLocalModelSurface();
    vi.mocked(listRegisteredProviderIds).mockReturnValue([
      "openai",
      ...LOCAL_PROVIDER_IDS
    ]);
    vi.mocked(isProviderConfigured).mockResolvedValue(true);

    const { body, status } = await requestJson("/api/models/providers");

    expect(status).toBe(200);
    expect(
      (body as Array<{ provider: string }>).map((entry) => entry.provider)
    ).toEqual(["openai", ...LOCAL_PROVIDER_IDS]);
  });

  it("returns disabled HuggingFace cache status without reading local cache", async () => {
    const { body, status } = await requestJson(
      "/api/models/huggingface/check_cache",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo_id: "user/local-model",
          allow_pattern: "*.safetensors"
        })
      }
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      repo_id: "user/local-model",
      all_present: false,
      total_files: 0,
      missing: ["*.safetensors"]
    });
    expect(access).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("omits local provider models from all-model responses in API-first mode", async () => {
    vi.mocked(listRegisteredProviderIds).mockReturnValue(["openai", "ollama"]);
    vi.mocked(isProviderConfigured).mockResolvedValue(true);

    const { body, status } = await requestJson("/api/models/all");
    const providers = modelProviders(body as UnifiedModel[]);

    expect(status).toBe(200);
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("ollama")).toBe(false);
  });
});
