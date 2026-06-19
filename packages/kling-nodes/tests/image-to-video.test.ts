import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KlingImageToVideoNode } from "../src/nodes/image-to-video.js";

const mockFetch = vi.fn();
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const videoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18]);
const videoB64 = Buffer.from(videoBytes).toString("base64");

function queueKlingVideoSuccess(): void {
  mockFetch
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { task_id: "task-1" } }), {
        status: 200
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            task_id: "task-1",
            task_status: "succeed",
            task_result: {
              videos: [{ url: "https://cdn.klingai.com/video.mp4" }]
            }
          }
        }),
        { status: 200 }
      )
    )
    .mockResolvedValueOnce(new Response(videoBytes, { status: 200 }));
}

describe("KlingImageToVideoNode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    process.env.KLING_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.KLING_API_KEY;
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("submits the first frame and prompt to Kling 3.0 Turbo", async () => {
    queueKlingVideoSuccess();
    const node = new KlingImageToVideoNode({
      image: {
        type: "image",
        data: Buffer.from(pngBytes).toString("base64")
      },
      prompt: "cinematic walk",
      duration: 5,
      resolution: "1080p"
    });

    const result = await node.process();

    const submitBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api-beijing.klingai.com/v1/videos/image2video"
    );
    expect(submitBody).toMatchObject({
      model_name: "kling-3.0-turbo",
      image: "data:image/png;base64,iVBORw==",
      prompt: "cinematic walk",
      mode: "pro",
      duration: 5
    });
    expect(result.output).toEqual({ type: "video", data: videoB64 });
  });

  it("requires a first-frame image", async () => {
    const node = new KlingImageToVideoNode({
      image: { type: "image", data: null, uri: "" },
      prompt: "cinematic walk"
    });

    await expect(node.process()).rejects.toThrow("first-frame image");
  });

  it("handles cleared image input with the first-frame validation error", async () => {
    const node = new KlingImageToVideoNode({
      image: null,
      prompt: "cinematic walk"
    });

    await expect(node.process()).rejects.toThrow("first-frame image");
  });
});
