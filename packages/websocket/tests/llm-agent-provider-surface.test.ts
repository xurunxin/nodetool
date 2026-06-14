import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "@nodetool-ai/runtime";
import { resolveNodeToolProvider } from "../src/custom-provider-resolver.js";

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
    getSecret: vi.fn()
  };
});

const originalModelSurface = process.env.NODETOOL_MODEL_SURFACE;

function resetModelSurface(): void {
  if (originalModelSurface == null) {
    delete process.env.NODETOOL_MODEL_SURFACE;
    return;
  }
  process.env.NODETOOL_MODEL_SURFACE = originalModelSurface;
}

describe("resolveNodeToolProvider model surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NODETOOL_MODEL_SURFACE;
    vi.mocked(getProvider).mockResolvedValue({ provider: "mock" } as never);
  });

  afterEach(() => {
    resetModelSurface();
    vi.restoreAllMocks();
  });

  it("rejects local-only runtime providers in API-first mode", async () => {
    await expect(resolveNodeToolProvider("ollama", "alice")).rejects.toThrow(
      /ollama.*disabled.*model surface/i
    );
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("allows local-only runtime providers in local-first mode", async () => {
    process.env.NODETOOL_MODEL_SURFACE = "local_first";

    await expect(resolveNodeToolProvider("ollama", "alice")).resolves.toEqual({
      provider: "mock"
    });
    expect(getProvider).toHaveBeenCalledWith("ollama", expect.any(Function));
  });

  it("keeps hosted runtime providers available in API-first mode", async () => {
    await expect(resolveNodeToolProvider("anthropic", "alice")).resolves.toEqual({
      provider: "mock"
    });
    expect(getProvider).toHaveBeenCalledWith("anthropic", expect.any(Function));
  });
});
