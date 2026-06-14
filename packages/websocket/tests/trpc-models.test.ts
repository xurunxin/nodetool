/**
 * Unit tests for the tRPC models router.
 *
 * Heavy external dependencies (provider instances, HF cache I/O) are mocked so
 * the tests remain fast and hermetic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// ── Mock @nodetool-ai/runtime ─────────────────────────────────────────────────

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    listRegisteredProviderIds: vi.fn(),
    isProviderConfigured: vi.fn(),
    getProvider: vi.fn()
  };
});

import {
  listRegisteredProviderIds,
  isProviderConfigured,
  getProvider
} from "@nodetool-ai/runtime";

// ── Mock @nodetool-ai/huggingface ─────────────────────────────────────────────

vi.mock("@nodetool-ai/huggingface", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/huggingface")>();
  return {
    ...actual,
    readCachedHfModels: vi.fn(),
    searchCachedHfModels: vi.fn(),
    getModelsByHfType: vi.fn(),
    deleteCachedHfModel: vi.fn(),
    getHuggingfaceFileInfos: vi.fn()
  };
});

import {
  readCachedHfModels,
  searchCachedHfModels,
  getModelsByHfType,
  deleteCachedHfModel,
  getHuggingfaceFileInfos
} from "@nodetool-ai/huggingface";

// ── Mock @nodetool-ai/models ──────────────────────────────────────────────────

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

import { Setting, getSecret } from "@nodetool-ai/models";

// ── Mock node:fs/promises & node:fs to avoid real disk I/O ────────────────

vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn(),
    readdir: vi.fn()
  };
});

import { access, readdir } from "node:fs/promises";

// ── Mock @nodetool-ai/transformers-js-nodes (cache-scan + path helpers) ──────

vi.mock("@nodetool-ai/transformers-js-nodes", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/transformers-js-nodes")>();
  return {
    ...actual,
    scanTransformersJsCache: vi.fn().mockResolvedValue([]),
    isRepoCached: vi.fn().mockResolvedValue(false),
    getTransformersJsCacheDir: vi.fn().mockReturnValue("/tmp/tjs-cache")
  };
});

import {
  scanTransformersJsCache,
  isRepoCached
} from "@nodetool-ai/transformers-js-nodes";

// ── Helpers ────────────────────────────────────────────────────────────────

const createCaller = createCallerFactory(appRouter);
const ORIGINAL_MODEL_SURFACE = process.env.NODETOOL_MODEL_SURFACE;
const LOCAL_ONLY_PROVIDER_IDS = [
  "ollama",
  "lmstudio",
  "llama_cpp",
  "vllm",
  "transformers_js"
] as const;
const HOSTED_PROVIDER_ID = "openai";

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

/** Minimal provider instance with all model-list methods returning empty arrays. */
function makeProvider(
  overrides: Partial<{
    getAvailableLanguageModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableImageModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableTTSModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableASRModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableEmbeddingModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    getAvailableVideoModels: () => Promise<{ id: string; name: string; provider: string }[]>;
    hasToolSupport: (model: string) => Promise<boolean>;
  }> = {}
) {
  return {
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    hasToolSupport: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

function enableLocalModelSurface(): void {
  process.env.NODETOOL_MODEL_SURFACE = "local_first";
}

function expectNoLocalProviders(
  models: Array<{ provider?: string | null }>
): void {
  const providers = models.map((model) => model.provider);
  for (const providerId of LOCAL_ONLY_PROVIDER_IDS) {
    expect(providers).not.toContain(providerId);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("models router", () => {
  beforeEach(() => {
    delete process.env.NODETOOL_MODEL_SURFACE;
    vi.clearAllMocks();
    // Default: no providers, no HF cache, no disk I/O errors
    (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (readCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (searchCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (getModelsByHfType as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deleteCachedHfModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getHuggingfaceFileInfos as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // Default: disk access returns ENOENT (nothing cached)
    (access as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (isRepoCached as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  afterEach(() => {
    if (ORIGINAL_MODEL_SURFACE === undefined) {
      delete process.env.NODETOOL_MODEL_SURFACE;
    } else {
      process.env.NODETOOL_MODEL_SURFACE = ORIGINAL_MODEL_SURFACE;
    }
    vi.restoreAllMocks();
  });

  // ── Authorization guard ──────────────────────────────────────────────────

  describe("auth guard (all protected procedures)", () => {
    it("providers throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.models.providers()).rejects.toThrow();
    });

    it("recommended throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.models.recommended({ check_servers: false })
      ).rejects.toThrow();
    });

    it("all throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.models.all()).rejects.toThrow();
    });
  });

  // ── providers ────────────────────────────────────────────────────────────

  describe("providers", () => {
    it("returns empty array when no providers are configured", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.providers();
      expect(result).toEqual([]);
    });

    it("returns provider info for configured providers", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        "openai"
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider()
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.providers();
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("openai");
      expect(result[0].capabilities).toContain("generate_message");
    });

    it("includes enabled custom endpoint providers", async () => {
      (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSetting([
          {
            id: "gateway",
            name: "Gateway",
            kind: "openai",
            baseUrl: "http://127.0.0.1:3000/v1",
            enabled: true,
            models: [{ id: "custom-chat", name: "Custom Chat" }],
            createdAt: "2026-06-14T08:00:00.000Z",
            updatedAt: "2026-06-14T08:00:00.000Z"
          }
        ])
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.providers();

      expect(result).toContainEqual({
        provider: "custom:gateway",
        capabilities: ["generate_message", "generate_messages"]
      });
    });
  });

  // ── model surface ────────────────────────────────────────────────────────

  describe("model surface", () => {
    it("hides local-only providers by default while keeping hosted providers", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        HOSTED_PROVIDER_ID,
        ...LOCAL_ONLY_PROVIDER_IDS
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider()
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.providers();

      expect(result.map((entry) => entry.provider)).toEqual([
        HOSTED_PROVIDER_ID
      ]);
      expect(getProvider).toHaveBeenCalledTimes(1);
      expect(getProvider).toHaveBeenCalledWith(
        HOSTED_PROVIDER_ID,
        expect.any(Function)
      );
    });

    it("filters local-only models from aggregate model lists by default", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        HOSTED_PROVIDER_ID,
        ...LOCAL_ONLY_PROVIDER_IDS
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
        async (providerId: string) =>
          makeProvider({
            getAvailableLanguageModels: vi.fn().mockResolvedValue([
              {
                id: `${providerId}-model`,
                name: `${providerId} Model`,
                provider: providerId
              }
            ])
          })
      );
      (readCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "cached-hf",
          name: "Cached HF",
          type: "language_model",
          provider: "huggingface",
          repo_id: "user/cached-hf",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "Xenova/local-model",
          dir: "/tmp/tjs-cache/Xenova/local-model",
          size_bytes: 123
        }
      ]);

      const caller = createCaller(makeCtx());
      const recommended = await caller.models.recommended({
        check_servers: false
      });
      const availableForKind = await caller.models.availableForKind({
        kind: "text_generation"
      });
      const all = await caller.models.all();

      expectNoLocalProviders(recommended);
      expectNoLocalProviders(availableForKind);
      expectNoLocalProviders(all);
      expect(all.map((model) => model.provider)).toContain(HOSTED_PROVIDER_ID);
      expect(availableForKind.map((model) => model.provider)).toContain(
        HOSTED_PROVIDER_ID
      );
    });

    it("restores local provider visibility in local_first mode", async () => {
      enableLocalModelSurface();
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        HOSTED_PROVIDER_ID,
        ...LOCAL_ONLY_PROVIDER_IDS
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider()
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.providers();
      const providers = result.map((entry) => entry.provider);

      expect(providers).toContain(HOSTED_PROVIDER_ID);
      for (const providerId of LOCAL_ONLY_PROVIDER_IDS) {
        expect(providers).toContain(providerId);
      }
    });

    it("returns disabled shapes for local cache queries and probes by default", async () => {
      (readCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "bert-base",
          name: "BERT Base",
          type: "language_model",
          provider: "huggingface",
          repo_id: "google/bert-base",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "Xenova/whisper-tiny.en",
          dir: "/tmp/tjs-cache/Xenova/whisper-tiny.en",
          size_bytes: 1000
        }
      ]);
      (isRepoCached as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const caller = createCaller(makeCtx());

      await expect(caller.models.huggingfaceList()).resolves.toEqual([]);
      await expect(caller.models.transformersJsList()).resolves.toEqual([]);
      await expect(
        caller.models.transformersJsIsCached({ repo_id: "Xenova/foo" })
      ).resolves.toBe(false);
    });

    it("rejects local management mutations by default", async () => {
      const caller = createCaller(makeCtx());

      await expect(
        caller.models.huggingfaceDelete({ repo_id: "openai/whisper-tiny" })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Local model management is disabled"
      });
      await expect(
        caller.models.pullOllamaModel({ model: "llama3" })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Local model management is disabled"
      });
    });
  });

  // ── recommended ──────────────────────────────────────────────────────────

  describe("recommended", () => {
    it("returns an array of models without check_servers", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommended({ check_servers: false });
      expect(Array.isArray(result)).toBe(true);
      // RECOMMENDED_MODELS is a non-empty constant array
      expect(result.length).toBeGreaterThan(0);
    });

    it("every recommended model has id and name", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommended({ check_servers: false });
      for (const model of result) {
        expect(typeof model.id).toBe("string");
        expect(typeof model.name).toBe("string");
      }
    });
  });

  // ── recommendedImage ─────────────────────────────────────────────────────

  describe("recommendedImage", () => {
    it("returns only image-modality models", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedImage();
      expect(Array.isArray(result)).toBe(true);
      // All returned models should have an image-related type
      for (const model of result) {
        expect(model.type).toMatch(/image/);
      }
    });
  });

  // ── recommendedLanguage ──────────────────────────────────────────────────

  describe("recommendedLanguage", () => {
    it("returns models with language-related types", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedLanguage();
      // language modality includes language_model and embedding_model
      for (const model of result) {
        expect(model.type).toMatch(/language|embedding/);
      }
    });
  });

  // ── recommendedLanguageEmbedding ─────────────────────────────────────────

  describe("recommendedLanguageEmbedding", () => {
    it("returns embedding models", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.recommendedLanguageEmbedding();
      for (const model of result) {
        expect(model.type).toMatch(/embedding/);
      }
    });
  });

  // ── all ──────────────────────────────────────────────────────────────────

  describe("all", () => {
    it("returns an array (minimum: RECOMMENDED_MODELS)", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.all();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("includes provider models when a provider is configured", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        "openai"
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "gpt-extra", name: "GPT Extra", provider: "openai" }
          ])
        })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.all();
      const ids = result.map((m) => m.id);
      expect(ids).toContain("gpt-extra");
    });

    it("stamps supports_tools on aggregated language models", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        "openai"
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "tool-yes", name: "Yes", provider: "openai" },
            { id: "tool-no", name: "No", provider: "openai" }
          ]),
          // The mock fans out to provider.hasToolSupport(modelId); the
          // aggregator should stamp the result on each unified model.
          hasToolSupport: vi
            .fn()
            .mockImplementation(async (m: string) => m !== "tool-no")
        })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.models.all();
      const yes = result.find((m) => m.id === "tool-yes");
      const no = result.find((m) => m.id === "tool-no");
      expect(yes?.supports_tools).toBe(true);
      expect(no?.supports_tools).toBe(false);
    });

    it("includes enabled custom endpoint language models", async () => {
      (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSetting([
          {
            id: "gateway",
            name: "Gateway",
            kind: "openai",
            baseUrl: "http://127.0.0.1:3000/v1",
            enabled: true,
            models: [
              {
                id: "custom-chat",
                name: "Custom Chat",
                contextWindow: 8192
              }
            ],
            createdAt: "2026-06-14T08:00:00.000Z",
            updatedAt: "2026-06-14T08:00:00.000Z"
          },
          {
            id: "disabled_gateway",
            name: "Disabled Gateway",
            kind: "openai",
            baseUrl: "https://disabled.example.test",
            enabled: false,
            models: [{ id: "disabled-chat", name: "Disabled Chat" }],
            createdAt: "2026-06-14T08:00:00.000Z",
            updatedAt: "2026-06-14T08:00:00.000Z"
          }
        ])
      );

      const caller = createCaller(makeCtx());
      const all = await caller.models.all();
      const available = await caller.models.availableForKind({
        kind: "text_generation"
      });

      for (const models of [all, available]) {
        expect(models).toContainEqual(
          expect.objectContaining({
            id: "custom-chat",
            name: "Custom Chat",
            provider: "custom:gateway",
            type: "language_model",
            context_window: 8192
          })
        );
        expect(models.map((model) => model.id)).not.toContain("disabled-chat");
      }
    });
  });

  // ── huggingfaceList ──────────────────────────────────────────────────────

  describe("huggingfaceList", () => {
    beforeEach(enableLocalModelSurface);

    it("returns empty array when HF cache is empty", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceList();
      expect(result).toEqual([]);
    });

    it("returns HF models from cache", async () => {
      (readCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "bert-base",
          name: "BERT Base",
          type: "language_model",
          repo_id: "google/bert-base",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceList();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("bert-base");
    });

    it("returns empty array when readCachedHfModels throws", async () => {
      (readCachedHfModels as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("disk error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceList();
      expect(result).toEqual([]);
    });
  });

  // ── huggingfaceSearch ────────────────────────────────────────────────────

  describe("huggingfaceSearch", () => {
    beforeEach(enableLocalModelSurface);

    it("returns matching models", async () => {
      (searchCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "whisper-tiny",
          name: "Whisper Tiny",
          type: "asr_model",
          repo_id: "openai/whisper-tiny",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceSearch({ query: "whisper" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("whisper-tiny");
    });

    it("returns empty array on error", async () => {
      (searchCachedHfModels as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("search error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceSearch({ query: "x" });
      expect(result).toEqual([]);
    });
  });

  // ── huggingfaceByType ────────────────────────────────────────────────────

  describe("huggingfaceByType", () => {
    beforeEach(enableLocalModelSurface);

    it("returns models of the requested type", async () => {
      (getModelsByHfType as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: "sd-1-5",
          name: "Stable Diffusion 1.5",
          type: "diffusers",
          repo_id: "runwayml/stable-diffusion-v1-5",
          path: null,
          downloaded: true,
          tags: []
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceByType({
        model_type: "diffusers"
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("sd-1-5");
    });

    it("returns empty array on error", async () => {
      (getModelsByHfType as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("hf error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceByType({
        model_type: "diffusers"
      });
      expect(result).toEqual([]);
    });
  });

  // ── transformersJsByType ─────────────────────────────────────────────────

  describe("transformersJsByType", () => {
    beforeEach(enableLocalModelSurface);

    it("returns the curated recommended list with downloaded=false when cache is empty", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsByType({
        model_type: "tjs.text_classification"
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].provider).toBe("transformers_js");
      expect(result[0].type).toBe("tjs.text_classification");
      expect(result.every((m) => m.downloaded === false)).toBe(true);
    });

    it("marks recommended entries as downloaded when present in cache", async () => {
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
          dir: "/tmp/tjs-cache/Xenova/distilbert-base-uncased-finetuned-sst-2-english",
          size_bytes: 1234567
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsByType({
        model_type: "tjs.text_classification"
      });
      const first = result.find(
        (m) =>
          m.repo_id === "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
      );
      expect(first?.downloaded).toBe(true);
      expect(first?.size_on_disk).toBe(1234567);
    });

    it("surfaces off-list cached repos that aren't recommended anywhere", async () => {
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "user/random-onnx-model",
          dir: "/tmp/tjs-cache/user/random-onnx-model",
          size_bytes: 99
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsByType({
        model_type: "tjs.text_classification"
      });
      expect(result.find((m) => m.repo_id === "user/random-onnx-model"))
        .toBeDefined();
    });

    it("does NOT cross-list a repo that is recommended under a different type", async () => {
      // whisper-tiny.en is recommended for tjs.automatic_speech_recognition,
      // not tjs.text_classification. It must not appear when querying TC.
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "Xenova/whisper-tiny.en",
          dir: "/tmp/tjs-cache/Xenova/whisper-tiny.en",
          size_bytes: 100
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsByType({
        model_type: "tjs.text_classification"
      });
      expect(result.find((m) => m.repo_id === "Xenova/whisper-tiny.en"))
        .toBeUndefined();
    });

    it("returns recommended list (with downloaded=false) on scan failure", async () => {
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("scan failed")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsByType({
        model_type: "tjs.text_classification"
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((m) => m.downloaded === false)).toBe(true);
    });

    it("returns empty for an unknown tjs.* type when cache is also empty", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsByType({
        model_type: "tjs.does_not_exist"
      });
      expect(result).toEqual([]);
    });
  });

  // ── transformersJsRecommended ────────────────────────────────────────────

  describe("transformersJsRecommended", () => {
    beforeEach(enableLocalModelSurface);

    it("returns the curated list with downloaded=false when cache is empty", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsRecommended({
        model_type: "tjs.text_classification"
      });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].provider).toBe("transformers_js");
      expect(result[0].type).toBe("tjs.text_classification");
      expect(result.every((m) => m.downloaded === false)).toBe(true);
    });

    it("marks downloaded=true for recommended repos present in cache", async () => {
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
          dir: "/tmp/tjs-cache/Xenova/distilbert-base-uncased-finetuned-sst-2-english",
          size_bytes: 7777
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsRecommended({
        model_type: "tjs.text_classification"
      });
      const hit = result.find(
        (m) =>
          m.repo_id === "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
      );
      expect(hit?.downloaded).toBe(true);
      expect(hit?.size_on_disk).toBe(7777);
    });

    it("does NOT include off-list cached repos (unlike transformersJsByType)", async () => {
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "user/random-onnx-model",
          dir: "/tmp/tjs-cache/user/random-onnx-model",
          size_bytes: 99
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsRecommended({
        model_type: "tjs.text_classification"
      });
      expect(result.find((m) => m.repo_id === "user/random-onnx-model"))
        .toBeUndefined();
    });

    it("returns empty for unknown tjs.* types", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsRecommended({
        model_type: "tjs.does_not_exist"
      });
      expect(result).toEqual([]);
    });
  });

  // ── transformersJsList ───────────────────────────────────────────────────

  describe("transformersJsList", () => {
    beforeEach(enableLocalModelSurface);

    it("returns every cached repo with downloaded=true", async () => {
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          repo_id: "Xenova/whisper-tiny.en",
          dir: "/tmp/tjs-cache/Xenova/whisper-tiny.en",
          size_bytes: 1000
        },
        {
          repo_id: "user/custom-model",
          dir: "/tmp/tjs-cache/user/custom-model",
          size_bytes: 2000
        }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.transformersJsList();
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.downloaded === true)).toBe(true);
      expect(result.every((m) => m.provider === "transformers_js")).toBe(true);
      expect(result.find((m) => m.repo_id === "Xenova/whisper-tiny.en")
        ?.size_on_disk).toBe(1000);
    });

    it("returns empty array when scan throws", async () => {
      (scanTransformersJsCache as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("nope")
      );
      const caller = createCaller(makeCtx());
      expect(await caller.models.transformersJsList()).toEqual([]);
    });
  });

  // ── transformersJsIsCached ───────────────────────────────────────────────

  describe("transformersJsIsCached", () => {
    beforeEach(enableLocalModelSurface);

    it("returns true when isRepoCached resolves true", async () => {
      (isRepoCached as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      const caller = createCaller(makeCtx());
      expect(
        await caller.models.transformersJsIsCached({ repo_id: "Xenova/foo" })
      ).toBe(true);
    });

    it("returns false on error", async () => {
      (isRepoCached as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("x"));
      const caller = createCaller(makeCtx());
      expect(
        await caller.models.transformersJsIsCached({ repo_id: "Xenova/foo" })
      ).toBe(false);
    });
  });

  // ── huggingfaceDelete ────────────────────────────────────────────────────

  describe("huggingfaceDelete", () => {
    beforeEach(enableLocalModelSurface);

    it("returns true on successful delete", async () => {
      (deleteCachedHfModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceDelete({
        repo_id: "openai/whisper-tiny"
      });
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      (deleteCachedHfModel as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("delete error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceDelete({
        repo_id: "openai/whisper-tiny"
      });
      expect(result).toBe(false);
    });
  });

  // ── ollama ───────────────────────────────────────────────────────────────

  describe("ollama", () => {
    beforeEach(enableLocalModelSurface);

    it("returns empty array when ollama is not configured", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.models.ollama();
      expect(result).toEqual([]);
    });

    it("returns ollama models when provider is configured", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "llama3", name: "Llama 3", provider: "ollama" }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.ollama();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Llama 3");
      expect(result[0].type).toBe("llama_model");
    });
  });

  // ── llmByProvider ────────────────────────────────────────────────────────

  describe("llmByProvider", () => {
    it("returns empty array when provider is not configured", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const caller = createCaller(makeCtx());
      const result = await caller.models.llmByProvider({ provider: "openai" });
      expect(result).toEqual([]);
    });

    it("returns language models from the configured provider", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "gpt-4o", name: "GPT-4o", provider: "openai" }
          ])
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.llmByProvider({ provider: "openai" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("gpt-4o");
      expect(result[0].type).toBe("language_model");
    });

    it("stamps supports_tools per model from provider.hasToolSupport", async () => {
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeProvider({
          getAvailableLanguageModels: vi.fn().mockResolvedValue([
            { id: "tool-yes", name: "Tool Yes", provider: "openai" },
            { id: "tool-no", name: "Tool No", provider: "openai" }
          ]),
          hasToolSupport: vi
            .fn()
            .mockImplementation(async (m: string) => m !== "tool-no")
        })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.llmByProvider({ provider: "openai" });
      expect(result).toHaveLength(2);
      expect(result.find((m) => m.id === "tool-yes")?.supports_tools).toBe(true);
      expect(result.find((m) => m.id === "tool-no")?.supports_tools).toBe(false);
    });
  });

  // ── tts ──────────────────────────────────────────────────────────────────

  describe("tts", () => {
    it("returns empty array when no providers are configured", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.tts();
      expect(result).toEqual([]);
    });

    it("aggregates TTS models across providers", async () => {
      (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
        "openai",
        "elevenlabs"
      ]);
      (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
        async (id: string) =>
          makeProvider({
            getAvailableTTSModels: vi.fn().mockResolvedValue([
              { id: `${id}-tts`, name: `${id} TTS`, provider: id }
            ])
          })
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.tts();
      expect(result.length).toBe(2);
      for (const model of result) {
        expect(model.type).toBe("tts_model");
      }
    });
  });

  // ── huggingfaceTryCacheFiles ──────────────────────────────────────────────

  describe("huggingfaceTryCacheFiles", () => {
    beforeEach(enableLocalModelSurface);

    it("returns downloaded:false for non-existent file", async () => {
      // access() already throws ENOENT by default
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceTryCacheFiles([
        { repo_id: "some/repo", path: "model.bin" }
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].downloaded).toBe(false);
    });

    it("returns downloaded:false for empty repo_id or path", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceTryCacheFiles([
        { repo_id: "", path: "" }
      ]);
      expect(result[0].downloaded).toBe(false);
    });
  });

  // ── huggingfaceTryCacheRepos ──────────────────────────────────────────────

  describe("huggingfaceTryCacheRepos", () => {
    beforeEach(enableLocalModelSurface);

    it("returns downloaded:false when no snapshots exist", async () => {
      // readdir returns [] and access throws — nothing cached
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceTryCacheRepos([
        "some/repo"
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].repo_id).toBe("some/repo");
      expect(result[0].downloaded).toBe(false);
    });
  });

  // ── huggingfaceCheckCache ──────────────────────────────────────────────────

  describe("huggingfaceCheckCache", () => {
    beforeEach(enableLocalModelSurface);

    it("returns all_present:true when no allow_pattern and no cache", async () => {
      // No allow_pattern → missing is empty → all_present is true
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCheckCache({
        repo_id: "some/repo"
      });
      expect(result.repo_id).toBe("some/repo");
      expect(result.all_present).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("reports missing patterns when allow_pattern is specified", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCheckCache({
        repo_id: "some/repo",
        allow_pattern: "*.bin"
      });
      expect(result.all_present).toBe(false);
      expect(result.missing).toContain("*.bin");
    });
  });

  // ── huggingfaceCacheStatus ─────────────────────────────────────────────────

  describe("huggingfaceCacheStatus", () => {
    beforeEach(enableLocalModelSurface);

    it("returns downloaded:false for a non-cached repo", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCacheStatus([
        {
          key: "k1",
          repo_id: "some/repo",
          model_type: null,
          path: null,
          allow_patterns: null,
          ignore_patterns: null
        }
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("k1");
      expect(result[0].downloaded).toBe(false);
    });

    it("returns downloaded:false for a specific file not in cache", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceCacheStatus([
        {
          key: "k2",
          repo_id: "some/repo",
          model_type: null,
          path: "model.safetensors",
          allow_patterns: null,
          ignore_patterns: null
        }
      ]);
      expect(result[0].downloaded).toBe(false);
    });
  });

  // ── pullOllamaModel ──────────────────────────────────────────────────────

  describe("pullOllamaModel", () => {
    beforeEach(enableLocalModelSurface);

    it("returns unavailable status (streaming not supported in TS server)", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.pullOllamaModel({ model: "llama3" });
      expect(result.status).toBe("unavailable");
      expect(typeof result.message).toBe("string");
    });
  });

  // ── huggingfaceFileInfo ──────────────────────────────────────────────────

  describe("huggingfaceFileInfo", () => {
    beforeEach(enableLocalModelSurface);

    it("returns file info from HuggingFace", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue("hf-token");
      (getHuggingfaceFileInfos as ReturnType<typeof vi.fn>).mockResolvedValue([
        { size: 1234, sha256: "abc" }
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceFileInfo([
        { repo_id: "openai/whisper-tiny", path: "model.bin" }
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(1234);
    });

    it("returns empty array on error", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (getHuggingfaceFileInfos as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API error")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.models.huggingfaceFileInfo([
        { repo_id: "openai/whisper-tiny", path: "model.bin" }
      ]);
      expect(result).toEqual([]);
    });
  });

  // ── ollamaModelInfo (stub) ────────────────────────────────────────────────

  describe("ollamaModelInfo", () => {
    beforeEach(enableLocalModelSurface);

    it("returns null (stub)", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.models.ollamaModelInfo();
      expect(result).toBeNull();
    });
  });
});
