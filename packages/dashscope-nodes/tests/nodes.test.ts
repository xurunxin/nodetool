import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDnsLookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
  lookup: mockDnsLookup
}));

import { WanxImageEditNode } from "../src/nodes/wanx-image-edit.js";
import { WanxImageToVideoNode } from "../src/nodes/wanx-image-to-video.js";
import { WanxTextToImageNode } from "../src/nodes/wanx-text-to-image.js";

const mockFetch = vi.fn();
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const videoBytes = new Uint8Array([0, 0, 0, 24]);

function queueWanxVideoSuccess(): void {
  mockFetch
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: { task_id: "task-1", task_status: "PENDING" }
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
}

function queueWanxImageSuccess(): void {
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
    .mockResolvedValueOnce(new Response(pngBytes, { status: 200 }));
}

function submitBody(): Record<string, unknown> {
  const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(options.body as string) as Record<string, unknown>;
}

describe("DashScope Wanxiang nodes", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    process.env.DASHSCOPE_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.DASHSCOPE_API_KEY;
    vi.unstubAllGlobals();
    mockFetch.mockReset();
    mockDnsLookup.mockReset();
  });

  it("registers metadata expected by the content-card renderer", () => {
    for (const Node of [
      WanxImageToVideoNode,
      WanxTextToImageNode,
      WanxImageEditNode
    ]) {
      expect(Node.requiredSettings).toEqual(["DASHSCOPE_API_KEY"]);
      expect(Node.autoSaveAsset).toBe(true);
      expect(Node.body).toBe("content_card");
    }
  });

  it("does not expose multi-image count controls until multi-output is supported", () => {
    expect(
      WanxTextToImageNode.getDeclaredProperties().map((prop) => prop.name)
    ).not.toContain("n");
    expect(
      WanxImageEditNode.getDeclaredProperties().map((prop) => prop.name)
    ).not.toContain("n");
  });

  it("WanxImageToVideoNode submits first_frame media and returns a VideoRef", async () => {
    queueWanxVideoSuccess();
    const node = new WanxImageToVideoNode({
      prompt: "slow motion",
      image: { type: "image", data: Buffer.from(pngBytes).toString("base64") },
      resolution: "1080P",
      duration: 5,
      prompt_extend: true,
      watermark: false,
      seed: 123
    });

    const result = await node.process();

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"
    );
    expect(submitBody()).toMatchObject({
      input: {
        prompt: "slow motion",
        media: [{ type: "first_frame", url: "data:image/png;base64,iVBORw==" }]
      },
      parameters: {
        resolution: "1080P",
        duration: 5,
        prompt_extend: true,
        watermark: false,
        seed: 123
      }
    });
    expect(result.output).toEqual({
      type: "video",
      data: Buffer.from(videoBytes).toString("base64")
    });
  });

  it("WanxTextToImageNode posts multimodal generation text and returns an ImageRef", async () => {
    queueWanxImageSuccess();
    const node = new WanxTextToImageNode({
      prompt: "a product poster",
      size: "1024*1024",
      n: 4,
      watermark: false
    });

    const result = await node.process();

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    );
    expect(submitBody()).toMatchObject({
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: "a product poster" }]
          }
        ]
      },
      parameters: {
        size: "1024*1024",
        n: 1,
        watermark: false
      }
    });
    expect(result.output).toMatchObject({
      type: "image",
      data: Buffer.from(pngBytes).toString("base64"),
      mimeType: "image/png"
    });
  });

  it("WanxImageEditNode forwards multiple reference images as multimodal content", async () => {
    queueWanxImageSuccess();
    const node = new WanxImageEditNode({
      prompt: "combine references",
      images: [
        { type: "image", data: Buffer.from(pngBytes).toString("base64") },
        { type: "image", uri: "https://assets.example/ref.png" }
      ],
      size: "1024*1024",
      n: 4,
      watermark: false,
      thinking_mode: "enabled"
    });

    await node.process();

    expect(
      (submitBody().input as { messages: { content: unknown[] }[] }).messages[0]
        ?.content
    ).toEqual([
      { image: "data:image/png;base64,iVBORw==" },
      { image: "https://assets.example/ref.png" },
      { text: "combine references" }
    ]);
    expect(submitBody()).toMatchObject({
      parameters: {
        n: 1,
        thinking_mode: true
      }
    });
  });
});
