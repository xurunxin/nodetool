import { describe, expect, it, vi } from "vitest";
import {
  compilePromptResources,
  createDataUrl,
  downloadProviderMediaBytes,
  downloadBytes,
  fetchProviderResponseWithRetries,
  inferImageMime,
  pollTask,
  type PromptResourceInput
} from "../src/china-media.js";

describe("compilePromptResources", () => {
  it("replaces aliased prompt references and keeps references in stable order", () => {
    const resources: PromptResourceInput[] = [
      { type: "image", alias: "style", url: "https://example.com/style.png" },
      { type: "image", alias: "hero", url: "https://example.com/hero.png" }
    ];

    const result = compilePromptResources(
      "make this move @hero and @style",
      resources
    );

    expect(result.text).toBe(
      "make this move [reference: hero] and [reference: style]"
    );
    expect(result.references.map((reference) => reference.alias)).toEqual([
      "hero",
      "style"
    ]);
    expect(result.references.map((reference) => reference.url)).toEqual([
      "https://example.com/hero.png",
      "https://example.com/style.png"
    ]);
  });

  it("leaves unknown at-mentions as literal prompt text", () => {
    const result = compilePromptResources(
      "use @missing please and mail a@b.com"
    );

    expect(result.text).toBe("use @missing please and mail a@b.com");
    expect(result.references).toEqual([]);
  });

  it("supports unicode aliases in prompt references", () => {
    const result = compilePromptResources("让 @主图 动起来", [
      { type: "image", alias: "主图", url: "https://example.com/hero.png" }
    ]);

    expect(result.text).toBe("让 [reference: 主图] 动起来");
    expect(result.references[0]).toMatchObject({
      type: "image",
      alias: "主图",
      url: "https://example.com/hero.png"
    });
  });

  it("deduplicates repeated aliases without duplicating references", () => {
    const result = compilePromptResources("use @hero then @hero again", [
      { type: "image", alias: "hero", url: "https://example.com/hero.png" }
    ]);

    expect(result.text).toBe(
      "use [reference: hero] then [reference: hero] again"
    );
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      type: "image",
      alias: "hero",
      url: "https://example.com/hero.png"
    });
  });

  it("preserves plain prompt text while carrying ordered unaliased resources", () => {
    const result = compilePromptResources("plain prompt", [
      { type: "video", url: "https://example.com/clip.mp4" },
      { type: "audio", url: "https://example.com/sound.mp3" }
    ]);

    expect(result.text).toBe("plain prompt");
    expect(result.references.map((reference) => reference.type)).toEqual([
      "video",
      "audio"
    ]);
  });
});

describe("inferImageMime", () => {
  it("detects common image signatures and falls back when unknown", () => {
    expect(
      inferImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))
    ).toBe("image/png");
    expect(inferImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg"
    );
    expect(
      inferImageMime(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50
        ])
      )
    ).toBe("image/webp");
    expect(inferImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe(
      "image/gif"
    );
    expect(inferImageMime(new Uint8Array([0x00]), "image/custom")).toBe(
      "image/custom"
    );
    expect(inferImageMime(new Uint8Array([0x00]))).toBe(
      "application/octet-stream"
    );
  });
});

describe("createDataUrl", () => {
  it("encodes bytes with detected and provided MIME types", () => {
    expect(createDataUrl(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe(
      "data:image/gif;base64,R0lGOA=="
    );
    expect(createDataUrl(new Uint8Array([1, 2, 3]), "video/mp4")).toBe(
      "data:video/mp4;base64,AQID"
    );
  });
});

describe("downloadBytes", () => {
  it("returns response bytes from global fetch", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    globalThis.fetch = fetchMock;

    try {
      await expect(downloadBytes("https://example.com/file")).resolves.toEqual(
        new Uint8Array([1, 2, 3])
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/file",
        undefined
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws a useful error for non-2xx responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response("bad gateway", {
        status: 500,
        statusText: "Server Error"
      });
    });

    try {
      await expect(
        downloadBytes(
          "https://example.com/file?signature=secret-token#private-fragment"
        )
      ).rejects.toThrow(
        "Failed to download https://example.com/file: HTTP 500 Server Error"
      );
      await expect(
        downloadBytes(
          "https://example.com/file?signature=secret-token#private-fragment"
        )
      ).rejects.not.toThrow("secret-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("downloadProviderMediaBytes", () => {
  it("retries transient result download failures", async () => {
    const originalFetch = globalThis.fetch;
    const output = new Uint8Array([4, 5, 6]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response(output, { status: 200 }));
    globalThis.fetch = fetchMock;

    try {
      await expect(
        downloadProviderMediaBytes(
          "https://93.184.216.34/file.mp4",
          "Test provider",
          { retryDelayMs: 0 }
        )
      ).resolves.toEqual(output);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("honors Retry-After for transient result downloads", async () => {
    vi.useFakeTimers();
    const originalFetch = globalThis.fetch;
    const output = new Uint8Array([7, 8, 9]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "1" }
        })
      )
      .mockResolvedValueOnce(new Response(output, { status: 200 }));
    globalThis.fetch = fetchMock;

    try {
      const result = downloadProviderMediaBytes(
        "https://93.184.216.34/file.mp4",
        "Test provider",
        { retryDelayMs: 0 }
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await expect(result).resolves.toEqual(output);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it("rejects unsafe redirect targets and redacts URL secrets", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: {
          location: "http://127.0.0.1/internal?token=secret-token#frag"
        }
      });
    });

    try {
      await expect(
        downloadProviderMediaBytes(
          "https://93.184.216.34/file?signature=secret-token#private-fragment",
          "Test provider"
        )
      ).rejects.toThrow(
        "Test provider returned unsafe media URL: http://127.0.0.1/internal"
      );
      await expect(
        downloadProviderMediaBytes(
          "https://93.184.216.34/file?signature=secret-token#private-fragment",
          "Test provider"
        )
      ).rejects.not.toThrow("secret-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fetchProviderResponseWithRetries", () => {
  it("drains transient response bodies before retrying", async () => {
    const transient = new Response("busy", { status: 500 });
    const drainSpy = vi.spyOn(transient, "arrayBuffer");
    const success = new Response("ok", { status: 200 });
    const operation = vi
      .fn()
      .mockResolvedValueOnce(transient)
      .mockResolvedValueOnce(success);

    await expect(
      fetchProviderResponseWithRetries(operation, { retryDelayMs: 0 })
    ).resolves.toBe(success);

    expect(drainSpy).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe("pollTask", () => {
  it("returns the completed polling value", async () => {
    let attempts = 0;

    await expect(
      pollTask({
        poll: async () => {
          attempts += 1;
          return { status: attempts === 2 ? "done" : "running" };
        },
        isComplete: (value) => value.status === "done",
        intervalMs: 0,
        timeoutMs: 100
      })
    ).resolves.toEqual({ status: "done" });
  });

  it("throws a clear failure error when a task fails", async () => {
    await expect(
      pollTask({
        poll: async () => ({ status: "failed", reason: "quota exceeded" }),
        isComplete: (value) => value.status === "done",
        isFailed: (value) =>
          value.status === "failed" ? value.reason : undefined,
        intervalMs: 0,
        timeoutMs: 100
      })
    ).rejects.toThrow("Polling failed: quota exceeded");
  });

  it("times out when polling does not complete", async () => {
    await expect(
      pollTask({
        poll: async () => ({ status: "running" }),
        isComplete: (value) => value.status === "done",
        intervalMs: 1,
        timeoutMs: 1
      })
    ).rejects.toThrow("Polling timed out after 1ms");
  });

  it("times out while a poll attempt is still pending", async () => {
    vi.useFakeTimers();

    try {
      const result = pollTask({
        poll: () =>
          new Promise<{ status: "running" }>(() => {
            // Intentionally pending to prove timeout races the poll operation.
          }),
        isComplete: (value) => value.status === "done",
        intervalMs: 1,
        timeoutMs: 25
      }).then(
        () => "resolved",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      );

      await vi.advanceTimersByTimeAsync(25);

      await expect(Promise.race([result, Promise.resolve("pending")])).resolves
        .toBe("Polling timed out after 25ms");
    } finally {
      vi.useRealTimers();
    }
  });

  it("respects abort signals", async () => {
    const controller = new AbortController();
    controller.abort("stop");

    await expect(
      pollTask({
        poll: async () => ({ status: "running" }),
        isComplete: (value) => value.status === "done",
        intervalMs: 0,
        timeoutMs: 100,
        signal: controller.signal
      })
    ).rejects.toThrow("Polling aborted: stop");
  });

  it("does not miss aborts while registering the delay listener", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const originalAddEventListener =
      controller.signal.addEventListener.bind(controller.signal);
    let abortListenerRegistrations = 0;
    vi.spyOn(controller.signal, "addEventListener").mockImplementation(
      (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ): void => {
        if (type === "abort") {
          abortListenerRegistrations += 1;
        }
        if (type === "abort" && abortListenerRegistrations === 2) {
          controller.abort("between checks");
        }
        originalAddEventListener(type, listener, options);
      }
    );

    try {
      const result = pollTask({
        poll: async () => ({ status: "running" }),
        isComplete: (value) => value.status === "done",
        intervalMs: 1_000,
        timeoutMs: 5_000,
        signal: controller.signal
      }).then(
        () => "resolved",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      );

      await vi.advanceTimersByTimeAsync(0);

      await expect(Promise.race([result, Promise.resolve("pending")])).resolves
        .toBe("Polling aborted: between checks");
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});
