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
import {
  deleteCachedHfModel,
  getModelsByHfType,
  readCachedHfModels,
  searchCachedHfModels
} from "@nodetool-ai/huggingface";
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
    deleteCachedHfModel: vi.fn(),
    getModelsByHfType: vi.fn(),
    readCachedHfModels: vi.fn(),
    searchCachedHfModels: vi.fn()
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
    vi.mocked(deleteCachedHfModel).mockResolvedValue(false);
    vi.mocked(getModelsByHfType).mockResolvedValue([]);
    vi.mocked(readCachedHfModels).mockResolvedValue([]);
    vi.mocked(searchCachedHfModels).mockResolvedValue([]);
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

  it("hides cached HuggingFace models in API-first mode", async () => {
    vi.mocked(readCachedHfModels).mockResolvedValue([
      {
        id: "cached-local",
        name: "Cached Local",
        type: "language_model",
        repo_id: "user/local",
        path: null,
        downloaded: true,
        tags: []
      }
    ]);

    const { body, status } = await requestJson("/api/models/huggingface");

    expect(status).toBe(200);
    expect(body).toEqual([]);
    expect(readCachedHfModels).not.toHaveBeenCalled();
  });

  it("disables HuggingFace cache deletion in API-first mode without deleting local state", async () => {
    vi.mocked(deleteCachedHfModel).mockResolvedValue(true);

    const { body, status } = await requestJson(
      "/api/models/huggingface?repo_id=user/local",
      { method: "DELETE" }
    );

    expect(status).toBe(200);
    expect(body).toBe(false);
    expect(deleteCachedHfModel).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("hides HuggingFace cache search in API-first mode", async () => {
    vi.mocked(searchCachedHfModels).mockResolvedValue([
      {
        id: "whisper-local",
        name: "Whisper Local",
        type: "language_model",
        repo_id: "openai/whisper-small",
        path: null,
        downloaded: true,
        tags: []
      }
    ]);

    const { body, status } = await requestJson(
      "/api/models/huggingface/search?query=whisper"
    );

    expect(status).toBe(200);
    expect(body).toEqual([]);
    expect(searchCachedHfModels).not.toHaveBeenCalled();
  });

  it("hides HuggingFace type lookups in API-first mode", async () => {
    vi.mocked(getModelsByHfType).mockResolvedValue([
      {
        id: "text-generation-local",
        name: "Text Generation Local",
        type: "language_model",
        repo_id: "user/text-generation",
        path: null,
        downloaded: true,
        tags: []
      }
    ]);

    const { body, status } = await requestJson(
      "/api/models/huggingface/type/text-generation"
    );

    expect(status).toBe(200);
    expect(body).toEqual([]);
    expect(getModelsByHfType).not.toHaveBeenCalled();
  });

  it("hides the direct Ollama REST model list in API-first mode", async () => {
    vi.mocked(isProviderConfigured).mockResolvedValue(true);

    const { body, status } = await requestJson("/api/models/ollama");

    expect(status).toBe(200);
    expect(body).toEqual([]);
    expect(getProvider).not.toHaveBeenCalledWith(
      "ollama",
      expect.any(Function)
    );
  });

  it("hides direct local language provider paths in API-first mode", async () => {
    vi.mocked(isProviderConfigured).mockResolvedValue(true);

    const { body, status } = await requestJson("/api/models/llm/ollama");

    expect(status).toBe(200);
    expect(body).toEqual([]);
    expect(getProvider).not.toHaveBeenCalledWith(
      "ollama",
      expect.any(Function)
    );
  });

  it("hides direct local image provider paths in API-first mode", async () => {
    vi.mocked(isProviderConfigured).mockResolvedValue(true);

    const { body, status } = await requestJson("/api/models/image/lmstudio");

    expect(status).toBe(200);
    expect(body).toEqual([]);
    expect(getProvider).not.toHaveBeenCalledWith(
      "lmstudio",
      expect.any(Function)
    );
  });

  it.each([
    ["/api/models/tts/ollama", "ollama"],
    ["/api/models/asr/lmstudio", "lmstudio"],
    ["/api/models/video/vllm", "vllm"],
    ["/api/models/embedding/transformers_js", "transformers_js"]
  ] as const)(
    "hides direct local provider path %s in API-first mode",
    async (path, provider) => {
      vi.mocked(isProviderConfigured).mockResolvedValue(true);

      const { body, status } = await requestJson(path);

      expect(status).toBe(200);
      expect(body).toEqual([]);
      expect(getProvider).not.toHaveBeenCalledWith(
        provider,
        expect.any(Function)
      );
    }
  );

  it("restores direct local provider paths in local-first mode", async () => {
    enableLocalModelSurface();
    vi.mocked(isProviderConfigured).mockResolvedValue(true);

    const { body, status } = await requestJson("/api/models/llm/ollama");

    expect(status).toBe(200);
    expect(body).toEqual([
      {
        id: "ollama-model",
        name: "ollama Model",
        provider: "ollama"
      }
    ]);
    expect(getProvider).toHaveBeenCalledWith("ollama", expect.any(Function));
  });

  it("returns disabled HuggingFace file cache checks without reading local cache", async () => {
    const { body, status } = await requestJson(
      "/api/models/huggingface/try_cache_files",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          { repo_id: "user/local-model", path: "model.safetensors" },
          { repo_id: "user/empty-path" }
        ])
      }
    );

    expect(status).toBe(200);
    expect(body).toEqual([
      {
        repo_id: "user/local-model",
        path: "model.safetensors",
        downloaded: false
      },
      {
        repo_id: "user/empty-path",
        path: "",
        downloaded: false
      }
    ]);
    expect(access).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("returns disabled HuggingFace repo cache checks without reading local cache", async () => {
    const { body, status } = await requestJson(
      "/api/models/huggingface/try_cache_repos",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(["user/local-a", "user/local-b"])
      }
    );

    expect(status).toBe(200);
    expect(body).toEqual([
      { repo_id: "user/local-a", downloaded: false },
      { repo_id: "user/local-b", downloaded: false }
    ]);
    expect(access).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("returns disabled HuggingFace fast cache status without reading local cache", async () => {
    const { body, status } = await requestJson(
      "/api/models/huggingface/cache_status",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          { key: "a", repo_id: "user/local-a", path: "a.bin" },
          { key: "b", repo_id: "user/local-b" }
        ])
      }
    );

    expect(status).toBe(200);
    expect(body).toEqual([
      { key: "a", downloaded: false },
      { key: "b", downloaded: false }
    ]);
    expect(access).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("returns disabled HuggingFace file info without local metadata reads", async () => {
    const { body, status } = await requestJson(
      "/api/models/huggingface/file_info",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([{ repo_id: "user/local-model" }])
      }
    );

    expect(status).toBe(200);
    expect(body).toEqual([]);
    expect(access).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("returns null for Ollama model info in API-first mode", async () => {
    const { body, status } = await requestJson("/api/models/ollama_model_info");

    expect(status).toBe(200);
    expect(body).toBeNull();
  });

  it("returns an unavailable Ollama pull response in API-first mode", async () => {
    const { body, status } = await requestJson("/api/models/pull_ollama_model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "llama3.2" })
    });

    expect(status).toBe(503);
    expect(body).toEqual({
      status: "unavailable",
      message: "Local model management is disabled"
    });
  });

  it("excludes cached HuggingFace entries from all-model responses in API-first mode", async () => {
    vi.mocked(readCachedHfModels).mockResolvedValue([
      {
        id: "cached-hf-all",
        name: "Cached HF All",
        type: "language_model",
        repo_id: "user/cached-hf-all",
        path: null,
        downloaded: true,
        tags: []
      }
    ]);

    const { body, status } = await requestJson("/api/models/all");
    const models = body as UnifiedModel[];

    expect(status).toBe(200);
    expect(models.map((model) => model.id)).not.toContain("cached-hf-all");
    expect(readCachedHfModels).not.toHaveBeenCalled();
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
