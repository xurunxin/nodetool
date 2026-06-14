import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    listRegisteredProviderIds: vi.fn(),
    isProviderConfigured: vi.fn(),
    getProvider: vi.fn()
  };
});

vi.mock("@nodetool-ai/huggingface", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/huggingface")>();
  return {
    ...actual,
    readCachedHfModels: vi.fn(),
    deleteCachedHfModel: vi.fn()
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

import { Setting } from "@nodetool-ai/models";
import {
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import {
  deleteCachedHfModel,
  readCachedHfModels
} from "@nodetool-ai/huggingface";
import { handleModelsApiRequest } from "../src/models-api.js";

const ORIGINAL_MODEL_SURFACE = process.env.NODETOOL_MODEL_SURFACE;
const LOCAL_ONLY_PROVIDER_IDS = [
  "ollama",
  "lmstudio",
  "llama_cpp",
  "vllm",
  "transformers_js"
] as const;

function makeRequest(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

function makeSetting(value: unknown): { getValue: () => string } {
  return {
    getValue: vi.fn().mockReturnValue(JSON.stringify(value))
  };
}

function makeProvider() {
  return {
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    hasToolSupport: vi.fn().mockResolvedValue(true)
  };
}

async function readJson(response: Response | null): Promise<unknown> {
  expect(response).not.toBeNull();
  return response?.json();
}

describe("models REST API model surface", () => {
  beforeEach(() => {
    delete process.env.NODETOOL_MODEL_SURFACE;
    vi.clearAllMocks();
    (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Setting.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (readCachedHfModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deleteCachedHfModel as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  afterEach(() => {
    if (ORIGINAL_MODEL_SURFACE === undefined) {
      delete process.env.NODETOOL_MODEL_SURFACE;
    } else {
      process.env.NODETOOL_MODEL_SURFACE = ORIGINAL_MODEL_SURFACE;
    }
    vi.restoreAllMocks();
  });

  it("hides local-only providers by default", async () => {
    (listRegisteredProviderIds as ReturnType<typeof vi.fn>).mockReturnValue([
      "openai",
      ...LOCAL_ONLY_PROVIDER_IDS
    ]);
    (isProviderConfigured as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getProvider as ReturnType<typeof vi.fn>).mockResolvedValue(makeProvider());

    const response = await handleModelsApiRequest(
      makeRequest("/api/models/providers")
    );
    const body = (await readJson(response)) as Array<{ provider: string }>;

    expect(body.map((item) => item.provider)).toEqual(["openai"]);
  });

  it("includes enabled custom endpoint providers and language models", async () => {
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
        }
      ])
    );

    const providersResponse = await handleModelsApiRequest(
      makeRequest("/api/models/providers")
    );
    const providers = (await readJson(providersResponse)) as Array<{
      provider: string;
      capabilities: string[];
    }>;
    expect(providers).toContainEqual({
      provider: "custom:gateway",
      capabilities: ["generate_message", "generate_messages"]
    });

    const allResponse = await handleModelsApiRequest(makeRequest("/api/models/all"));
    const all = (await readJson(allResponse)) as Array<Record<string, unknown>>;
    expect(all).toContainEqual(
      expect.objectContaining({
        id: "custom-chat",
        name: "Custom Chat",
        provider: "custom:gateway",
        type: "language_model",
        context_window: 8192
      })
    );

    const llmResponse = await handleModelsApiRequest(
      makeRequest("/api/models/llm/custom%3Agateway")
    );
    expect(await readJson(llmResponse)).toEqual([
      expect.objectContaining({
        id: "custom-chat",
        provider: "custom:gateway"
      })
    ]);
  });

  it("returns disabled shapes for local cache APIs by default", async () => {
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

    const response = await handleModelsApiRequest(
      makeRequest("/api/models/huggingface")
    );

    expect(await readJson(response)).toEqual([]);
  });

  it("rejects local cache deletion by default", async () => {
    const response = await handleModelsApiRequest(
      makeRequest("/api/models/huggingface?repo_id=openai%2Fwhisper-tiny", {
        method: "DELETE"
      })
    );

    expect(response?.status).toBe(403);
    expect(await readJson(response)).toEqual({
      detail: "Local model management is disabled"
    });
    expect(deleteCachedHfModel).not.toHaveBeenCalled();
  });
});
