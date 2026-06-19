import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildKlingImageToVideoBody,
  getKlingApiKey,
  klingCreatePath,
  klingHeaders,
  parseKlingTaskResult,
  submitKlingTask,
  waitForKlingResult,
  KLING_BASE_URL
} from "../src/kling-base.js";

const mockFetch = vi.fn();

describe("Kling base helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    process.env.KLING_API_KEY = "env-key";
  });

  afterEach(() => {
    delete process.env.KLING_API_KEY;
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("uses the official China base URL and bearer auth header", () => {
    expect(KLING_BASE_URL).toBe("https://api-beijing.klingai.com");
    expect(klingCreatePath("/v1/videos/image2video")).toBe(
      "https://api-beijing.klingai.com/v1/videos/image2video"
    );
    expect(getKlingApiKey({ KLING_API_KEY: "secret-key" })).toBe("secret-key");
    expect(klingHeaders("secret-key")).toEqual({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json"
    });
  });

  it("builds the confirmed Kling 3.0 Turbo image-to-video request body", () => {
    const body = buildKlingImageToVideoBody({
      model: "kling-v3-0-turbo",
      prompt: "make hero walk",
      firstFrameUrl: "data:image/png;base64,AAAA",
      resolution: "1080p",
      duration: 5,
      callbackUrl: "https://callback.example/kling",
      externalTaskId: "external-1",
      watermarkInfo: { text: "nodetool" }
    });

    expect(body).toEqual({
      model_name: "kling-v3-0-turbo",
      image: "AAAA",
      prompt: "make hero walk",
      mode: "pro",
      duration: 5,
      callback_url: "https://callback.example/kling",
      external_task_id: "external-1",
      watermark_info: { text: "nodetool" }
    });
  });

  it("rejects prompt image resources instead of silently dropping them", () => {
    expect(() =>
      buildKlingImageToVideoBody({
        model: "kling-v3-0-turbo",
        prompt: "make @hero walk",
        firstFrameUrl: "data:image/png;base64,AAAA",
        resolution: "1080p",
        duration: 5,
        resources: [
          {
            type: "image",
            alias: "hero",
            url: "https://assets.example/hero.png"
          }
        ]
      })
    ).toThrow(/does not support prompt resource @hero/);
  });

  it("submits an image-to-video task to the documented endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { task_id: "task-1" } }), {
        status: 200
      })
    );

    await expect(
      submitKlingTask({
        apiKey: "secret-key",
        path: "/v1/videos/image2video",
        body: {
          model_name: "kling-v3-0-turbo",
          image: "AAAA"
        }
      })
    ).resolves.toBe("task-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api-beijing.klingai.com/v1/videos/image2video",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model_name: "kling-v3-0-turbo",
          image: "AAAA"
        })
      }
    );
  });

  it("parses successful task_result payloads with media URLs", () => {
    const result = parseKlingTaskResult({
      data: {
        task_id: "task-1",
        task_status: "succeed",
        task_result: {
          videos: [{ url: "https://cdn.example/video.mp4" }]
        }
      }
    });

    expect(result).toEqual({
      taskId: "task-1",
      status: "succeed",
      mediaUrls: ["https://cdn.example/video.mp4"],
      message: undefined
    });
  });

  it("polls /tasks until success and downloads the media bytes", async () => {
    const videoBytes = new Uint8Array([1, 2, 3, 4]);
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { task_id: "task-1", status: "processing" } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              task_id: "task-1",
              task_status: "succeed",
              task_result: {
                videos: [{ url: "https://93.184.216.34/video.mp4" }]
              }
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(videoBytes, { status: 200 }));

    await expect(
      waitForKlingResult("secret-key", "task-1", {
        pollIntervalMs: 0,
        timeoutMs: 100
      })
    ).resolves.toEqual(videoBytes);

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api-beijing.klingai.com/v1/videos/image2video/task-1"
    );
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://api-beijing.klingai.com/v1/videos/image2video/task-1"
    );
    expect(mockFetch.mock.calls[2][0]).toBe("https://93.184.216.34/video.mp4");
  });

  it("surfaces failed task status", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            task_id: "task-1",
            status: "failed",
            message: "content rejected"
          }
        }),
        { status: 200 }
      )
    );

    await expect(
      waitForKlingResult("secret-key", "task-1", {
        pollIntervalMs: 0,
        timeoutMs: 100
      })
    ).rejects.toThrow("content rejected");
  });
});
