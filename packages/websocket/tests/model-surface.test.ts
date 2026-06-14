import { describe, expect, it } from "vitest";
import {
  filterModelsForSurface,
  filterProviderIdsForSurface,
  getModelSurfaceMode,
  isLocalModelManagementEnabled,
  isProviderVisibleForSurface
} from "../src/model-surface.js";

describe("model surface", () => {
  it("defaults to api_first", () => {
    expect(getModelSurfaceMode({})).toBe("api_first");
    expect(isLocalModelManagementEnabled({})).toBe(false);
  });

  it("hides local-only provider ids in api_first mode", () => {
    expect(
      filterProviderIdsForSurface(
        ["openai", "ollama", "lmstudio", "anthropic", "vllm"],
        "api_first"
      )
    ).toEqual(["openai", "anthropic"]);
  });

  it("keeps local providers in local_first mode", () => {
    expect(
      filterProviderIdsForSurface(["openai", "ollama"], "local_first")
    ).toEqual(["openai", "ollama"]);
  });

  it("filters model records by provider", () => {
    expect(
      filterModelsForSurface(
        [
          { id: "a", provider: "openai" },
          { id: "b", provider: "vllm" },
          { id: "c", model_type: "transformers_js" }
        ],
        "api_first"
      )
    ).toEqual([{ id: "a", provider: "openai" }]);
  });

  it("treats provider ids case-insensitively", () => {
    expect(isProviderVisibleForSurface("Ollama", "api_first")).toBe(false);
  });

  it("enables local model management only in local_first mode", () => {
    expect(
      isLocalModelManagementEnabled({
        NODETOOL_MODEL_SURFACE: "local_first"
      })
    ).toBe(true);
  });
});
