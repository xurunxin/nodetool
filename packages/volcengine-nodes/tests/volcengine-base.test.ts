import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ARK_BASE_URL,
  arkCreatePath,
  arkHeaders,
  buildSeedanceContent,
  buildSeedreamBody,
  generateSeedreamImage,
  getArkApiKey,
  parseSeedanceTaskResult,
  submitSeedanceTask,
  waitForSeedanceResult
} from "../src/volcengine-base.js";

const mockFetch = vi.fn();

describe("Volcengine Ark base helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    process.env.ARK_API_KEY = "env-key";
  });

  afterEach(() => {
    delete process.env.ARK_API_KEY;
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("uses the official Ark base URL and bearer auth header", () => {
    expect(ARK_BASE_URL).toBe("https://ark.cn-beijing.volces.com");
    expect(arkCreatePath("/api/v3/images/generations")).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    );
    expect(getArkApiKey({ ARK_API_KEY: "secret-key" })).toBe("secret-key");
    expect(arkHeaders("secret-key")).toEqual({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json"
    });
  });

  it("builds Seedance content from prompt text and image/video references", () => {
    expect(
      buildSeedanceContent("animate @hero near @clip", [
        {
          type: "image",
          alias: "hero",
          url: "https://assets.example/hero.png"
        },
        {
          type: "video",
          alias: "clip",
          url: "https://assets.example/clip.mp4"
        }
      ])
    ).toEqual([
      { type: "text", text: "animate [reference: hero] near [reference: clip]" },
      {
        type: "image_url",
        image_url: { url: "https://assets.example/hero.png" },
        role: "reference_image"
      },
      {
        type: "video_url",
        video_url: { url: "https://assets.example/clip.mp4" },
        role: "reference_video"
      }
    ]);
  });

  it("rejects audio references for the first release", () => {
    expect(() =>
      buildSeedanceContent("sync @song", [
        { type: "audio", alias: "song", url: "https://assets.example/song.mp3" }
      ])
    ).toThrow(/audio references are not supported/);
  });

  it("builds a Seedream body with optional reference images and optimizer options", () => {
    expect(
      buildSeedreamBody({
        model: "seedream-4-0-250828",
        prompt: "make a poster",
        imageUrls: ["https://assets.example/ref.png"],
        size: "1024x1024",
        responseFormat: "url",
        watermark: false,
        optimizePrompt: true
      })
    ).toEqual({
      model: "seedream-4-0-250828",
      prompt: "make a poster",
      image: ["https://assets.example/ref.png"],
      size: "1024x1024",
      response_format: "url",
      watermark: false,
      optimize_prompt_options: { optimize_prompt: true }
    });
  });

  it("submits Seedance tasks to the official endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "task-1", status: "queued" }), {
        status: 200
      })
    );

    await expect(
      submitSeedanceTask("secret-key", { model: "seedance-2-0-pro" })
    ).resolves.toBe("task-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: "seedance-2-0-pro" })
      }
    );
  });

  it("parses Seedance task results with nested video URLs", () => {
    expect(
      parseSeedanceTaskResult({
        id: "task-1",
        status: "succeeded",
        content: { video_url: { url: "https://cdn.example/out.mp4" } }
      })
    ).toEqual({
      taskId: "task-1",
      status: "succeeded",
      mediaUrls: ["https://cdn.example/out.mp4"],
      message: undefined
    });
  });

  it("polls a Seedance task until success and downloads the video bytes", async () => {
    const videoBytes = new Uint8Array([1, 2, 3, 4]);
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "running" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task-1",
            status: "succeeded",
            content: { video_url: { url: "https://93.184.216.34/video.mp4" } }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(videoBytes, { status: 200 }));

    await expect(
      waitForSeedanceResult("secret-key", "task-1", {
        pollIntervalMs: 0,
        timeoutMs: 100
      })
    ).resolves.toEqual(videoBytes);

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task-1"
    );
    expect(mockFetch.mock.calls[2][0]).toBe("https://93.184.216.34/video.mp4");
  });

  it("retries transient Seedance task query responses", async () => {
    const videoBytes = new Uint8Array([9, 10]);
    mockFetch
      .mockResolvedValueOnce(new Response("busy", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "running" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task-1",
            status: "succeeded",
            content: { video_url: { url: "https://93.184.216.34/video.mp4" } }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(videoBytes, { status: 200 }));

    await expect(
      waitForSeedanceResult("secret-key", "task-1", {
        pollIntervalMs: 0,
        timeoutMs: 2_000
      })
    ).resolves.toEqual(videoBytes);

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task-1"
    );
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("rejects private Seedance media URLs before downloading", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "task-1",
          status: "succeeded",
          content: {
            video_url: {
              url: "http://169.254.169.254/latest/meta-data?signature=secret"
            }
          }
        }),
        { status: 200 }
      )
    );

    let caught: unknown;
    try {
      await waitForSeedanceResult("secret-key", "task-1", {
        pollIntervalMs: 0,
        timeoutMs: 100
      });
    } catch (error) {
      caught = error;
    }

    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toContain("http://169.254.169.254/latest/meta-data");
    expect(message).not.toContain("secret");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["completed", "done"])(
    "treats Seedance %s status as success",
    async (status) => {
      const videoBytes = new Uint8Array([5, 6, 7, 8]);
      mockFetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "task-1",
              status,
              content: { video_url: { url: "https://93.184.216.34/video.mp4" } }
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(new Response(videoBytes, { status: 200 }));

      await expect(
        waitForSeedanceResult("secret-key", "task-1", {
          pollIntervalMs: 0,
          timeoutMs: 100
        })
      ).resolves.toEqual(videoBytes);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      mockFetch.mockReset();
    }
  );

  it("surfaces failed Seedance task status", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "task-1",
          status: "failed",
          error: { message: "content rejected" }
        }),
        { status: 200 }
      )
    );

    await expect(
      waitForSeedanceResult("secret-key", "task-1", {
        pollIntervalMs: 0,
        timeoutMs: 100
      })
    ).rejects.toThrow("content rejected");
  });

  it.each(["fail", "cancelled", "canceled"])(
    "treats Seedance %s status as failure",
    async (status) => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task-1",
            status,
            error: { message: "task stopped" }
          }),
          { status: 200 }
        )
      );

      await expect(
        waitForSeedanceResult("secret-key", "task-1", {
          pollIntervalMs: 0,
          timeoutMs: 100
        })
      ).rejects.toThrow("task stopped");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      mockFetch.mockReset();
    }
  );

  it("generates a Seedream image and downloads URL output", async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ url: "https://93.184.216.34/image.png" }]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(imageBytes, { status: 200 }));

    await expect(
      generateSeedreamImage("secret-key", {
        model: "seedream-4-0-250828",
        prompt: "a cat"
      })
    ).resolves.toEqual(imageBytes);

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    );
    expect(mockFetch.mock.calls[1][0]).toBe("https://93.184.216.34/image.png");
  });

  it("rejects private Seedream media URLs before downloading", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              url: "http://169.254.169.254/latest/meta-data?signature=secret"
            }
          ]
        }),
        { status: 200 }
      )
    );

    let caught: unknown;
    try {
      await generateSeedreamImage("secret-key", {
        model: "seedream-4-0-250828",
        prompt: "a cat"
      });
    } catch (error) {
      caught = error;
    }

    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toContain("http://169.254.169.254/latest/meta-data");
    expect(message).not.toContain("secret");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws clearly when Seedream returns no image URL", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );

    await expect(
      generateSeedreamImage("secret-key", {
        model: "seedream-4-0-250828",
        prompt: "a cat"
      })
    ).rejects.toThrow(/returned no image URL/);
  });
});
