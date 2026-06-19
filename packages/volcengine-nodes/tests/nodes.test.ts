import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeedanceImageToVideoNode } from "../src/nodes/seedance-image-to-video.js";
import { SeedanceTextToVideoNode } from "../src/nodes/seedance-text-to-video.js";
import { SeedreamImageEditNode } from "../src/nodes/seedream-image-edit.js";
import { SeedreamTextToImageNode } from "../src/nodes/seedream-text-to-image.js";

const mockFetch = vi.fn();
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const videoBytes = new Uint8Array([0, 0, 0, 24]);

function queueSeedanceSuccess(): void {
  mockFetch
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "task-1", status: "queued" }), {
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
}

function queueSeedreamSuccess(): void {
  mockFetch
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ url: "https://93.184.216.34/image.png" }] }),
        { status: 200 }
      )
    )
    .mockResolvedValueOnce(new Response(pngBytes, { status: 200 }));
}

function submitBody(): Record<string, unknown> {
  const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(options.body as string) as Record<string, unknown>;
}

describe("Volcengine nodes", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    process.env.ARK_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.ARK_API_KEY;
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it("registers metadata expected by the content-card renderer", async () => {
    for (const Node of [
      SeedanceTextToVideoNode,
      SeedanceImageToVideoNode,
      SeedreamTextToImageNode,
      SeedreamImageEditNode
    ]) {
      expect(Node.requiredSettings).toEqual(["ARK_API_KEY"]);
      expect(Node.autoSaveAsset).toBe(true);
      expect(Node.body).toBe("content_card");
    }
  });

  it("SeedanceTextToVideoNode submits text content and returns a VideoRef", async () => {
    queueSeedanceSuccess();
    const node = new SeedanceTextToVideoNode({
      prompt: "cinematic dragon",
      duration: 5,
      ratio: "16:9",
      resolution: "1080p",
      watermark: false
    });

    const result = await node.process();

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
    );
    expect(submitBody()).toMatchObject({
      content: [{ type: "text", text: "cinematic dragon" }],
      duration: 5,
      ratio: "16:9",
      resolution: "1080p",
      watermark: false
    });
    expect(result.output).toEqual({
      type: "video",
      data: Buffer.from(videoBytes).toString("base64")
    });
  });

  it("SeedanceImageToVideoNode includes the reference image", async () => {
    queueSeedanceSuccess();
    const node = new SeedanceImageToVideoNode({
      prompt: "make it move",
      image: { type: "image", data: Buffer.from(pngBytes).toString("base64") }
    });

    await node.process();

    expect(submitBody().content).toEqual([
      { type: "text", text: "make it move" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,iVBORw==" },
        role: "first_frame"
      }
    ]);
  });

  it("SeedreamTextToImageNode posts to images/generations and returns an ImageRef", async () => {
    queueSeedreamSuccess();
    const node = new SeedreamTextToImageNode({
      prompt: "a poster",
      size: "1024x1024",
      watermark: false
    });

    const result = await node.process();

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    );
    expect(submitBody()).toMatchObject({
      prompt: "a poster",
      size: "1024x1024",
      response_format: "url",
      watermark: false
    });
    expect(result.output).toMatchObject({
      type: "image",
      data: Buffer.from(pngBytes).toString("base64"),
      mimeType: "image/png"
    });
  });

  it("SeedreamImageEditNode forwards multiple reference images through image", async () => {
    queueSeedreamSuccess();
    const node = new SeedreamImageEditNode({
      prompt: "combine references",
      images: [
        { type: "image", data: Buffer.from(pngBytes).toString("base64") },
        { type: "image", uri: "https://assets.example/ref.png" }
      ]
    });

    await node.process();

    expect(submitBody().image).toEqual([
      "data:image/png;base64,iVBORw==",
      "https://assets.example/ref.png"
    ]);
  });
});
