import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHSCOPE_BASE_URL,
  buildWanxImageBody,
  buildWanxVideoBody,
  dashscopeCreatePath,
  dashscopeHeaders,
  generateWanxImage,
  getDashScopeApiKey,
  parseDashScopeTaskResult,
  submitWanxVideoTask,
  waitForWanxVideoResult
} from "../src/dashscope-base.js";

const mockFetch = vi.fn();

describe("DashScope Wanxiang base helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    process.env.DASHSCOPE_API_KEY = "env-key";
  });

  afterEach(() => {
    delete process.env.DASHSCOPE_API_KEY;
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("uses the official DashScope base URL and async bearer headers", () => {
    expect(DASHSCOPE_BASE_URL).toBe("https://dashscope.aliyuncs.com");
    expect(dashscopeCreatePath("/api/v1/tasks/task-1")).toBe(
      "https://dashscope.aliyuncs.com/api/v1/tasks/task-1"
    );
    expect(getDashScopeApiKey({ DASHSCOPE_API_KEY: "secret-key" })).toBe(
      "secret-key"
    );
    expect(dashscopeHeaders("secret-key", true)).toEqual({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    });
  });

  it("builds a Wanxiang video body with first and last frame resources", () => {
    expect(
      buildWanxVideoBody({
        model: "wan2.7-i2v-2026-04-25",
        prompt: "animate @first_frame into @last_frame",
        resources: [
          {
            type: "image",
            alias: "first_frame",
            url: "https://assets.example/start.png"
          },
          {
            type: "image",
            alias: "last_frame",
            url: "https://assets.example/end.png"
          }
        ],
        resolution: "1080P",
        duration: 5,
        promptExtend: true,
        watermark: false,
        seed: 42
      })
    ).toEqual({
      model: "wan2.7-i2v-2026-04-25",
      input: {
        prompt:
          "animate [reference: first_frame] into [reference: last_frame]",
        media: [
          { type: "first_frame", url: "https://assets.example/start.png" },
          { type: "last_frame", url: "https://assets.example/end.png" }
        ]
      },
      parameters: {
        resolution: "1080P",
        duration: 5,
        prompt_extend: true,
        watermark: false,
        seed: 42
      }
    });
  });

  it("accepts first_clip video resources and rejects unsupported audio references", () => {
    expect(
      buildWanxVideoBody({
        model: "wan2.7-i2v-2026-04-25",
        prompt: "continue @first_clip",
        resources: [
          {
            type: "video",
            alias: "first_clip",
            url: "https://assets.example/clip.mp4"
          }
        ]
      }).input
    ).toEqual({
      prompt: "continue [reference: first_clip]",
      media: [{ type: "first_clip", url: "https://assets.example/clip.mp4" }]
    });

    expect(() =>
      buildWanxVideoBody({
        model: "wan2.7-i2v-2026-04-25",
        prompt: "drive @voice",
        resources: [
          {
            type: "audio",
            alias: "voice",
            url: "https://assets.example/voice.mp3"
          }
        ]
      })
    ).toThrow(/audio references are not supported/);
  });

  it("builds Wanxiang multimodal image messages with image refs before text", () => {
    expect(
      buildWanxImageBody({
        model: "wan2.7-image-pro",
        prompt: "preserve identity and change outfit",
        imageUrls: [
          "https://assets.example/ref-1.png",
          "https://assets.example/ref-2.png"
        ],
        size: "1024*1024",
        n: 1,
        watermark: false,
        thinkingMode: "enabled"
      })
    ).toEqual({
      model: "wan2.7-image-pro",
      input: {
        messages: [
          {
            role: "user",
            content: [
              { image: "https://assets.example/ref-1.png" },
              { image: "https://assets.example/ref-2.png" },
              { text: "preserve identity and change outfit" }
            ]
          }
        ]
      },
      parameters: {
        size: "1024*1024",
        n: 1,
        watermark: false,
        thinking_mode: "enabled"
      }
    });
  });

  it("submits Wanxiang video tasks to the official async endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: { task_id: "task-1", task_status: "PENDING" }
        }),
        { status: 200 }
      )
    );

    await expect(
      submitWanxVideoTask("secret-key", { model: "wan2.7-i2v-2026-04-25" })
    ).resolves.toBe("task-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable"
        },
        body: JSON.stringify({ model: "wan2.7-i2v-2026-04-25" })
      }
    );
  });

  it("parses DashScope task results with output task id, status, and media URLs", () => {
    expect(
      parseDashScopeTaskResult({
        output: {
          task_id: "task-1",
          task_status: "SUCCEEDED",
          video_url: "https://cdn.example/video.mp4"
        }
      })
    ).toEqual({
      taskId: "task-1",
      status: "succeeded",
      mediaUrls: ["https://cdn.example/video.mp4"],
      message: undefined
    });
  });

  it("polls DashScope task query endpoint and downloads the video bytes", async () => {
    const videoBytes = new Uint8Array([1, 2, 3, 4]);
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: { task_id: "task-1", task_status: "RUNNING" }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              task_id: "task-1",
              task_status: "SUCCEEDED",
              video_url: "https://cdn.example/video.mp4"
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(videoBytes, { status: 200 }));

    await expect(
      waitForWanxVideoResult("secret-key", "task-1", {
        pollIntervalMs: 0,
        timeoutMs: 100
      })
    ).resolves.toEqual(videoBytes);

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://dashscope.aliyuncs.com/api/v1/tasks/task-1"
    );
    expect(mockFetch.mock.calls[2]?.[0]).toBe("https://cdn.example/video.mp4");
  });

  it.each(["FAILED", "CANCELED", "UNKNOWN"])(
    "surfaces DashScope %s task status as failure",
    async (status) => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              task_id: "task-1",
              task_status: status,
              message: "task stopped"
            }
          }),
          { status: 200 }
        )
      );

      await expect(
        waitForWanxVideoResult("secret-key", "task-1", {
          pollIntervalMs: 0,
          timeoutMs: 100
        })
      ).rejects.toThrow("task stopped");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      mockFetch.mockReset();
    }
  );

  it("generates a Wanxiang image from output choices and downloads the image", async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              choices: [
                {
                  message: {
                    content: [{ image: "https://cdn.example/image.png" }]
                  }
                }
              ]
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(imageBytes, { status: 200 }));

    await expect(
      generateWanxImage("secret-key", {
        model: "wan2.7-image",
        input: { messages: [] }
      })
    ).resolves.toEqual(imageBytes);

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    );
    expect(mockFetch.mock.calls[1]?.[0]).toBe("https://cdn.example/image.png");
  });

  it.each([
    "http://169.254.169.254/latest/meta-data?signature=secret",
    "http://2130706433/private?signature=secret",
    "http://0x7f000001/private?signature=secret",
    "http://0177.0.0.1/private?signature=secret",
    "http://127.1/private?signature=secret",
    "http://[::ffff:127.0.0.1]/private?signature=secret",
    "http://metadata.google.internal/computeMetadata/v1?signature=secret"
  ])("rejects unsafe provider media URL %s before downloading", async (url) => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: [{ image: url }] } }]
          }
        }),
        { status: 200 }
      )
    );

    let caught: unknown;
    try {
      await generateWanxImage("secret-key", {
        model: "wan2.7-image",
        input: { messages: [] }
      });
    } catch (error) {
      caught = error;
    }

    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toContain("unsafe media URL");
    expect(message).not.toContain("secret");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    mockFetch.mockReset();
  });
});
