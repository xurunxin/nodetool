import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  buildSeedanceContent,
  buildSeedreamBody,
  generateSeedreamImage,
  submitSeedanceTask,
  waitForSeedanceResult
} from "@nodetool-ai/nodes-utils/volcengine";
import { createDataUrl, inferImageMime } from "@nodetool-ai/nodes-utils";
import { BaseProvider } from "./base-provider.js";
import type {
  ImageToImageParams,
  ImageToVideoParams,
  ImageModel,
  Message,
  ProviderStreamItem,
  TextToImageParams,
  TextToVideoParams,
  VideoModel
} from "./types.js";

const IMAGE_MODELS: ImageModel[] = [
  {
    id: "doubao-seedream-5-0-260128",
    name: "Doubao Seedream 5.0",
    provider: PROVIDER_IDS.VOLCENGINE_ARK,
    supportedTasks: ["text_to_image", "image_to_image"]
  },
  {
    id: "doubao-seedream-4-0-250828",
    name: "Doubao Seedream 4.0",
    provider: PROVIDER_IDS.VOLCENGINE_ARK,
    supportedTasks: ["text_to_image", "image_to_image"]
  }
];

const VIDEO_MODELS: VideoModel[] = [
  {
    id: "doubao-seedance-2-0-260128",
    name: "Doubao Seedance 2.0",
    provider: PROVIDER_IDS.VOLCENGINE_ARK,
    supportedTasks: ["text_to_video", "image_to_video"]
  }
];

export class VolcengineArkProvider extends BaseProvider {
  private readonly apiKey: string;

  static override requiredSecrets(): string[] {
    return ["ARK_API_KEY"];
  }

  constructor(apiKeyOrSecrets: string | Record<string, unknown> = "") {
    super(PROVIDER_IDS.VOLCENGINE_ARK);
    this.apiKey =
      typeof apiKeyOrSecrets === "string"
        ? apiKeyOrSecrets
        : ((apiKeyOrSecrets["ARK_API_KEY"] as string) ?? "");
  }

  override getContainerEnv(): Record<string, string> {
    return { ARK_API_KEY: this.apiKey };
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
      throw new Error("ARK_API_KEY is not configured");
    }
    return this.apiKey;
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    return generateSeedreamImage(
      this.requireApiKey(),
      buildSeedreamBody({
        model: params.model.id,
        prompt,
        size: imageSize(params),
        responseFormat: "url",
        watermark: false,
        optimizePrompt: true
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
    return generateSeedreamImage(
      this.requireApiKey(),
      buildSeedreamBody({
        model: params.model.id,
        prompt,
        imageUrls,
        size: imageSize(params),
        responseFormat: "url",
        watermark: false,
        optimizePrompt: true
      })
    );
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const taskId = await submitSeedanceTask(
      this.requireApiKey(),
      buildSeedanceBody(params.model.id, buildSeedanceContent(prompt), params)
    );
    return waitForSeedanceResult(this.requireApiKey(), taskId, {
      timeoutMs:
        params.timeoutSeconds == null
          ? undefined
          : Math.trunc(params.timeoutSeconds * 1000)
    });
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const imageUrls = imageDataUrls(images);
    if (imageUrls.length === 0) {
      throw new Error("At least one reference image is required");
    }
    const resources = imageUrls.map((url, index) => ({
      type: "image" as const,
      alias: `image_${index + 1}`,
      url
    }));
    const prompt = [
      params.prompt?.trim() ?? "",
      ...resources.map((r) => `@${r.alias}`)
    ]
      .filter(Boolean)
      .join(" ");
    const taskId = await submitSeedanceTask(
      this.requireApiKey(),
      buildSeedanceBody(
        params.model.id,
        buildSeedanceContent(prompt, resources),
        params
      )
    );
    return waitForSeedanceResult(this.requireApiKey(), taskId, {
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
      "volcengine_ark media provider does not support chat generation"
    );
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error(
      "volcengine_ark media provider does not support chat streaming"
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

type VideoParams = TextToVideoParams | ImageToVideoParams;

function imageSize(params: ImageSizeParams): string | undefined {
  if (params.resolution) {
    return params.resolution;
  }
  if (params.width && params.height) {
    return `${Math.trunc(params.width)}x${Math.trunc(params.height)}`;
  }
  if (params.targetWidth && params.targetHeight) {
    return `${Math.trunc(params.targetWidth)}x${Math.trunc(
      params.targetHeight
    )}`;
  }
  return seedreamSizeFromAspectRatio(params.aspectRatio);
}

function seedreamSizeFromAspectRatio(
  aspectRatio: string | null | undefined
): string | undefined {
  switch (aspectRatio) {
    case "16:9":
      return "1280x720";
    case "9:16":
      return "720x1280";
    case "4:3":
      return "1024x768";
    case "3:4":
      return "768x1024";
    case "1:1":
      return "1024x1024";
    default:
      return undefined;
  }
}

function buildSeedanceBody(
  model: string,
  content: Record<string, unknown>[],
  params: VideoParams
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    content
  };
  if (params.aspectRatio) {
    body.ratio = params.aspectRatio;
  }
  if (params.durationSeconds != null) {
    body.duration = Math.trunc(params.durationSeconds);
  }
  if (params.resolution) {
    body.resolution = params.resolution;
  }
  if (params.seed != null) {
    body.seed = Math.trunc(params.seed);
  }
  return body;
}

function imageDataUrls(images: Uint8Array[]): string[] {
  return images
    .filter((image) => image.length > 0)
    .map((image) => createDataUrl(image, inferImageMime(image, "image/png")));
}
