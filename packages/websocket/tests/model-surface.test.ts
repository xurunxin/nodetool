import { describe, expect, it } from "vitest";
import {
  filterModelsForSurface,
  filterProviderIdsForSurface,
  getModelSurfaceMode,
  isLocalModelManagementEnabled
} from "../src/model-surface.js";

describe("model surface", () => {
  it("defaults to api_first", () => {
    expect(getModelSurfaceMode({})).toBe("api_first");
    expect(isLocalModelManagementEnabled({})).toBe(false);
  });

  it("hides local-only provider ids in api_first mode", () => {
    expect(
      filterProviderIdsForSurface(
        ["openai", "ollama", "mlx", "anthropic"],
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
          { id: "b", provider: "vllm" }
        ],
        "api_first"
      )
    ).toEqual([{ id: "a", provider: "openai" }]);
  });
});
