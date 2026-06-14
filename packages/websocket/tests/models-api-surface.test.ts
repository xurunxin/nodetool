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
    getSecret: vi.fn()
  };
});

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
