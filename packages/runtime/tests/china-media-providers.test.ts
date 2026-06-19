import { afterEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  BaseProvider,
  providerCapabilities
} from "../src/providers/base-provider.js";
import {
  getProvider,
  listRegisteredProviderIds
} from "../src/providers/index.js";
import type {
  ImageModel,
  Message,
  ProviderStreamItem,
  VideoModel
} from "../src/providers/types.js";

const CHINA_MEDIA_PROVIDERS = [
  {
    id: PROVIDER_IDS.DASHSCOPE,
    secretKey: "DASHSCOPE_API_KEY"
  },
  {
    id: PROVIDER_IDS.VOLCENGINE_ARK,
    secretKey: "ARK_API_KEY"
  },
  {
    id: PROVIDER_IDS.KLING,
    secretKey: "KLING_API_KEY"
  }
] as const;

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const imageModel = (id: string, provider: string): ImageModel => ({
  id,
  name: id,
  provider
});

const videoModel = (id: string, provider: string): VideoModel => ({
  id,
  name: id,
  provider
});

function responseJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

function dataUrl(bytes: Uint8Array, mimeType = "application/octet-stream"): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function mockFetchSequence(responses: Response[]): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("data:")) {
      return originalFetch(url, init);
    }
    const next = responses.shift();
    if (!next) {
      throw new Error(`unexpected fetch: ${String(url)} ${init?.method ?? "GET"}`);
    }
    return next;
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

function postedBodies(mockFetch: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return mockFetch.mock.calls
    .map((call) => call[1] as RequestInit | undefined)
    .filter((init): init is RequestInit => typeof init?.body === "string")
    .map((init) => JSON.parse(init.body as string) as Record<string, unknown>);
}

function sortedCapabilities(instance: BaseProvider): string[] {
  return [...providerCapabilities(instance)].sort();
}

class ChatCapableProvider extends BaseProvider {
  constructor() {
    super(PROVIDER_IDS.OPENAI);
  }

  override async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    return { role: "assistant", content: "ok" };
  }

  override async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "ok", done: true };
  }
}

describe("China media providers", () => {
  it("defines stable provider ids", () => {
    expect(PROVIDER_IDS.DASHSCOPE).toBe("dashscope");
    expect(PROVIDER_IDS.VOLCENGINE_ARK).toBe("volcengine_ark");
    expect(PROVIDER_IDS.KLING).toBe("kling");
  });

  it("registers each provider and creates it with its matching API key", async () => {
    const registeredIds = listRegisteredProviderIds();

    for (const provider of CHINA_MEDIA_PROVIDERS) {
      expect(registeredIds).toContain(provider.id);

      const instance = await getProvider(provider.id, async (key) =>
        key === provider.secretKey ? "test-key" : undefined
      );

      expect(instance.provider).toBe(provider.id);
      expect(instance.getContainerEnv()[provider.secretKey]).toBe("test-key");
    }
  });

  it("exposes model lists matching confirmed provider helper coverage", async () => {
    for (const provider of CHINA_MEDIA_PROVIDERS) {
      const instance = await getProvider(provider.id, async (key) =>
        key === provider.secretKey ? "test-key" : undefined
      );

      const imageModels = await instance.getAvailableImageModels();
      const videoModels = await instance.getAvailableVideoModels();

      if (provider.id === PROVIDER_IDS.KLING) {
        expect(imageModels).toEqual([]);
      } else {
        expect(imageModels.length).toBeGreaterThan(0);
      }
      expect(videoModels.length).toBeGreaterThan(0);
      expect(imageModels.every((model) => model.provider === provider.id)).toBe(
        true
      );
      expect(videoModels.every((model) => model.provider === provider.id)).toBe(
        true
      );
    }
  });

  it("advertises only confirmed generic media capabilities", async () => {
    const dashscope = await getProvider(PROVIDER_IDS.DASHSCOPE, async () => "k");
    const volcengine = await getProvider(
      PROVIDER_IDS.VOLCENGINE_ARK,
      async () => "k"
    );
    const kling = await getProvider(PROVIDER_IDS.KLING, async () => "k");

    expect(sortedCapabilities(dashscope)).toEqual([
      "image_to_image",
      "image_to_video",
      "text_to_image"
    ]);
    expect(sortedCapabilities(volcengine)).toEqual([
      "image_to_image",
      "image_to_video",
      "text_to_image",
      "text_to_video"
    ]);
    expect(sortedCapabilities(kling)).toEqual(["image_to_video"]);
  });

  it("keeps chat capabilities for providers that opt in to chat generation", () => {
    expect(sortedCapabilities(new ChatCapableProvider())).toEqual([
      "generate_message",
      "generate_messages"
    ]);
  });

  it("DashScope textToImage builds a Wanxiang image request and returns downloaded bytes", async () => {
    const output = Uint8Array.from([1, 2, 3, 4]);
    const mockFetch = mockFetchSequence([
      responseJson({
        output: {
          choices: [
            {
              message: {
                content: [{ image: dataUrl(output, "image/png") }]
              }
            }
          ]
        }
      })
    ]);
    const provider = await getProvider(PROVIDER_IDS.DASHSCOPE, async () => "k");

    await expect(
      provider.textToImage({
        model: imageModel("wan2.7-image", PROVIDER_IDS.DASHSCOPE),
        prompt: "paint a dragon",
        aspectRatio: "16:9"
      })
    ).resolves.toEqual(output);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer k" })
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      model: "wan2.7-image",
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: "paint a dragon" }]
          }
        ]
      },
      parameters: { size: "1280*720", n: 1 }
    });
  });

  it("DashScope imageToImage forwards image bytes as Wanxiang data URL references", async () => {
    const output = Uint8Array.from([5, 6, 7]);
    const mockFetch = mockFetchSequence([
      responseJson({
        output: {
          choices: [
            {
              message: {
                content: [{ image: dataUrl(output, "image/png") }]
              }
            }
          ]
        }
      })
    ]);
    const provider = await getProvider(PROVIDER_IDS.DASHSCOPE, async () => "k");

    await provider.imageToImage(
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1])],
      {
        model: imageModel("wan2.7-image-pro", PROVIDER_IDS.DASHSCOPE),
        prompt: "make it cinematic",
        resolution: "1024*1024"
      }
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const content = body.input.messages[0].content;
    expect(content[0].image).toMatch(/^data:image\/png;base64,/);
    expect(content[1]).toEqual({ text: "make it cinematic" });
    expect(body.parameters.size).toBe("1024*1024");
    expect(body.parameters.thinking_mode).toBe(true);
  });

  it("DashScope imageToVideo uses first and last frame Wanxiang media references", async () => {
    const output = Uint8Array.from([8, 9]);
    const mockFetch = mockFetchSequence([
      responseJson({ output: { task_id: "task-1", task_status: "PENDING" } }),
      responseJson({
        output: {
          task_id: "task-1",
          task_status: "SUCCEEDED",
          video_url: dataUrl(output, "video/mp4")
        }
      })
    ]);
    const provider = await getProvider(PROVIDER_IDS.DASHSCOPE, async () => "k");

    await expect(
      provider.imageToVideo(
        [
          Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1]),
          Uint8Array.from([0xff, 0xd8, 0xff, 2])
        ],
        {
          model: videoModel("wan2.7-i2v-2026-04-25", PROVIDER_IDS.DASHSCOPE),
          prompt: "move from start to finish",
          resolution: "1080P",
          durationSeconds: 5
        }
      )
    ).resolves.toEqual(output);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.input.prompt).toBe(
      "move from start to finish [reference: first_frame] [reference: last_frame]"
    );
    expect(body.input.media).toHaveLength(2);
    expect(body.input.media[0]).toMatchObject({ type: "first_frame" });
    expect(body.input.media[0].url).toMatch(/^data:image\/png;base64,/);
    expect(body.input.media[1]).toMatchObject({ type: "last_frame" });
    expect(body.input.media[1].url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("Volcengine textToImage and imageToImage build Seedream image requests", async () => {
    const textOutput = Uint8Array.from([10]);
    const editOutput = Uint8Array.from([11, 12]);
    const mockFetch = mockFetchSequence([
      responseJson({
        data: [{ url: dataUrl(textOutput, "image/png") }]
      }),
      responseJson({
        data: [{ url: dataUrl(editOutput, "image/png") }]
      })
    ]);
    const provider = await getProvider(
      PROVIDER_IDS.VOLCENGINE_ARK,
      async () => "k"
    );

    await expect(
      provider.textToImage({
        model: imageModel(
          "doubao-seedream-5-0-260128",
          PROVIDER_IDS.VOLCENGINE_ARK
        ),
        prompt: "a red lantern",
        aspectRatio: "1:1"
      })
    ).resolves.toEqual(textOutput);
    await expect(
      provider.imageToImage(
        [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 3])],
        {
          model: imageModel(
            "doubao-seedream-5-0-260128",
            PROVIDER_IDS.VOLCENGINE_ARK
          ),
          prompt: "turn it blue",
          resolution: "2K"
        }
      )
    ).resolves.toEqual(editOutput);

    const bodies = postedBodies(mockFetch);
    const textBody = bodies[0];
    expect(textBody).toMatchObject({
      model: "doubao-seedream-5-0-260128",
      prompt: "a red lantern",
      size: "1024x1024",
      response_format: "url"
    });
    const editBody = bodies[1];
    expect(editBody.image[0]).toMatch(/^data:image\/png;base64,/);
    expect(editBody.size).toBe("2K");
  });

  it("Volcengine textToVideo and imageToVideo build Seedance requests and download videos", async () => {
    const textOutput = Uint8Array.from([13]);
    const imageOutput = Uint8Array.from([14, 15]);
    const mockFetch = mockFetchSequence([
      responseJson({ data: { id: "text-task", status: "queued" } }),
      responseJson({
        data: {
          id: "text-task",
          status: "succeeded",
          content: { video_url: dataUrl(textOutput, "video/mp4") }
        }
      }),
      responseJson({ data: { id: "image-task", status: "queued" } }),
      responseJson({
        data: {
          id: "image-task",
          status: "succeeded",
          content: { video_url: dataUrl(imageOutput, "video/mp4") }
        }
      })
    ]);
    const provider = await getProvider(
      PROVIDER_IDS.VOLCENGINE_ARK,
      async () => "k"
    );

    await expect(
      provider.textToVideo({
        model: videoModel(
          "doubao-seedance-2-0-260128",
          PROVIDER_IDS.VOLCENGINE_ARK
        ),
        prompt: "lanterns rising",
        resolution: "1080p",
        durationSeconds: 6
      })
    ).resolves.toEqual(textOutput);
    await expect(
      provider.imageToVideo(
        [Uint8Array.from([0xff, 0xd8, 0xff, 4])],
        {
          model: videoModel(
            "doubao-seedance-2-0-260128",
            PROVIDER_IDS.VOLCENGINE_ARK
          ),
          prompt: "animate the lantern"
        }
      )
    ).resolves.toEqual(imageOutput);

    const bodies = postedBodies(mockFetch);
    const textBody = bodies[0];
    expect(textBody).toMatchObject({
      model: "doubao-seedance-2-0-260128",
      content: [{ type: "text", text: "lanterns rising" }],
      resolution: "1080p",
      duration: 6
    });
    const imageBody = bodies[1];
    expect(imageBody.content[0]).toEqual({
      type: "text",
      text: "animate the lantern [reference: first_frame]"
    });
    expect(imageBody.content[1]).toMatchObject({
      type: "image_url",
      role: "first_frame"
    });
    expect(imageBody.content[1].image_url.url).toMatch(
      /^data:image\/jpeg;base64,/
    );
  });

  it("Kling imageToVideo uses the confirmed image-to-video helper only", async () => {
    const output = Uint8Array.from([16, 17]);
    const mockFetch = mockFetchSequence([
      responseJson({ data: { task_id: "task-1", status: "submitted" } }),
      responseJson({
        data: {
          task_id: "task-1",
          task_status: "succeed",
          task_result: {
            videos: [{ url: dataUrl(output, "video/mp4") }]
          }
        }
      })
    ]);
    const provider = await getProvider(PROVIDER_IDS.KLING, async () => "k");

    await expect(
      provider.imageToVideo([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], {
        model: videoModel("kling-v3-0-turbo", PROVIDER_IDS.KLING),
        prompt: "make the character wave",
        resolution: "1080p",
        durationSeconds: 5
      })
    ).resolves.toEqual(output);

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api-beijing.klingai.com/v1/videos/image2video"
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      model_name: "kling-v3-0-turbo",
      image: expect.not.stringMatching(/^data:/),
      prompt: "make the character wave",
      mode: "pro",
      duration: 5
    });
  });
});
