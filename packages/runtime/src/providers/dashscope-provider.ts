import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  buildWanxImageBody,
  buildWanxVideoBody,
  generateWanxImage,
  submitWanxVideoTask,
  waitForWanxVideoResult
} from "@nodetool-ai/nodes-utils/dashscope";
import {
  createDataUrl,
  inferImageMime
} from "@nodetool-ai/nodes-utils/china-media";
import { BaseProvider } from "./base-provider.js";
import type {
  ImageToImageParams,
  ImageToVideoParams,
  ImageModel,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  VideoModel
} from "./types.js";

const IMAGE_MODELS: ImageModel[] = [
  {
    id: "wan2.7-image",
    name: "Wanxiang 2.7 Image",
    provider: PROVIDER_IDS.DASHSCOPE,
    supportedTasks: ["text_to_image"]
  },
  {
    id: "wan2.7-image-pro",
    name: "Wanxiang 2.7 Image Pro",
    provider: PROVIDER_IDS.DASHSCOPE,
    supportedTasks: ["text_to_image", "image_to_image"]
  }
];

const VIDEO_MODELS: VideoModel[] = [
  {
    id: "wan2.7-i2v-2026-04-25",
    name: "Wanxiang 2.7 Image to Video",
    provider: PROVIDER_IDS.DASHSCOPE,
    supportedTasks: ["image_to_video"]
  }
];

export class DashScopeProvider extends BaseProvider {
  private readonly apiKey: string;

  static override requiredSecrets(): string[] {
    return ["DASHSCOPE_API_KEY"];
  }

  constructor(apiKeyOrSecrets: string | Record<string, unknown> = "") {
    super(PROVIDER_IDS.DASHSCOPE);
    this.apiKey =
      typeof apiKeyOrSecrets === "string"
        ? apiKeyOrSecrets
        : ((apiKeyOrSecrets["DASHSCOPE_API_KEY"] as string) ?? "");
  }

  override getContainerEnv(): Record<string, string> {
    return { DASHSCOPE_API_KEY: this.apiKey };
  }

  override supportsChatGeneration(): boolean {
    return false;
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return IMAGE_MODELS;
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return VIDEO_MODELS;
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error("DASHSCOPE_API_KEY is not configured");
    }
    return this.apiKey;
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    return generateWanxImage(
      this.requireApiKey(),
      buildWanxImageBody({
        model: params.model.id,
        prompt,
        size: imageSize(params),
        watermark: false
      })
    );
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const imageUrls = imageDataUrls(images);
    if (imageUrls.length === 0) {
      throw new Error("At least one reference image is required");
    }
    return generateWanxImage(
      this.requireApiKey(),
      buildWanxImageBody({
        model: params.model.id,
        prompt,
        imageUrls,
        size: imageSize(params),
        watermark: false,
        thinkingMode: "enabled"
      })
    );
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const imageUrls = imageDataUrls(images);
    if (imageUrls.length === 0) {
      throw new Error("A first-frame image is required");
    }
    const resources = [
      { type: "image" as const, alias: "first_frame", url: imageUrls[0] }
    ];
    if (imageUrls[1]) {
      resources.push({
        type: "image" as const,
        alias: "last_frame",
        url: imageUrls[1]
      });
    }

    const promptParts = [params.prompt?.trim() ?? "", "@first_frame"];
    if (imageUrls[1]) {
      promptParts.push("@last_frame");
    }
    const taskId = await submitWanxVideoTask(
      this.requireApiKey(),
      buildWanxVideoBody({
        model: params.model.id,
        prompt: promptParts.filter(Boolean).join(" "),
        resources,
        resolution: params.resolution ?? undefined,
        duration:
          params.durationSeconds == null
            ? undefined
            : Math.trunc(params.durationSeconds),
        seed: params.seed == null ? undefined : Math.trunc(params.seed),
        promptExtend: true,
        watermark: false
      })
    );
    return waitForWanxVideoResult(this.requireApiKey(), taskId, {
      timeoutMs:
        params.timeoutSeconds == null
          ? undefined
          : Math.trunc(params.timeoutSeconds * 1000)
    });
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error(
      "dashscope does not support chat generation in this provider"
    );
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error(
      "dashscope does not support chat streaming in this provider"
    );
  }
}

type ImageSizeParams = {
  width?: number;
  height?: number;
  aspectRatio?: string | null;
  resolution?: string | null;
  targetWidth?: number | null;
  targetHeight?: number | null;
};

function imageSize(params: ImageSizeParams): string | undefined {
  if (params.resolution) {
    return params.resolution;
  }
  if (params.width && params.height) {
    return `${Math.trunc(params.width)}*${Math.trunc(params.height)}`;
  }
  if (params.targetWidth && params.targetHeight) {
    return `${Math.trunc(params.targetWidth)}*${Math.trunc(
      params.targetHeight
    )}`;
  }
  return dashScopeSizeFromAspectRatio(params.aspectRatio);
}

function dashScopeSizeFromAspectRatio(
  aspectRatio: string | null | undefined
): string | undefined {
  switch (aspectRatio) {
    case "16:9":
      return "1280*720";
    case "9:16":
      return "720*1280";
    case "4:3":
      return "1024*768";
    case "3:4":
      return "768*1024";
    case "1:1":
      return "1024*1024";
    default:
      return undefined;
  }
}

function imageDataUrls(images: Uint8Array[]): string[] {
  return images
    .filter((image) => image.length > 0)
    .map((image) => createDataUrl(image, inferImageMime(image, "image/png")));
}
