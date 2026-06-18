import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  buildKlingImageToVideoBody,
  KLING_IMAGE_TO_VIDEO_MODEL,
  submitKlingTask,
  waitForKlingResult
} from "@nodetool-ai/nodes-utils/kling";
import { createDataUrl, inferImageMime } from "@nodetool-ai/nodes-utils";
import { BaseProvider } from "./base-provider.js";
import type {
  ImageToVideoParams,
  ImageModel,
  Message,
  ProviderStreamItem,
  VideoModel
} from "./types.js";

const IMAGE_MODELS: ImageModel[] = [];

const VIDEO_MODELS: VideoModel[] = [
  {
    id: KLING_IMAGE_TO_VIDEO_MODEL,
    name: "Kling 3.0 Turbo",
    provider: PROVIDER_IDS.KLING,
    supportedTasks: ["image_to_video"]
  }
];

export class KlingProvider extends BaseProvider {
  private readonly apiKey: string;

  static override requiredSecrets(): string[] {
    return ["KLING_API_KEY"];
  }

  constructor(apiKeyOrSecrets: string | Record<string, unknown> = "") {
    super(PROVIDER_IDS.KLING);
    this.apiKey =
      typeof apiKeyOrSecrets === "string"
        ? apiKeyOrSecrets
        : ((apiKeyOrSecrets["KLING_API_KEY"] as string) ?? "");
  }

  override getContainerEnv(): Record<string, string> {
    return { KLING_API_KEY: this.apiKey };
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
      throw new Error("KLING_API_KEY is not configured");
    }
    return this.apiKey;
  }

  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const firstFrameUrl = imageDataUrls(images)[0];
    if (!firstFrameUrl) {
      throw new Error("A first-frame image is required");
    }
    const model = params.model.id || KLING_IMAGE_TO_VIDEO_MODEL;
    const taskId = await submitKlingTask({
      apiKey: this.requireApiKey(),
      path: `/image-to-video/${model}`,
      body: buildKlingImageToVideoBody({
        prompt: params.prompt ?? "",
        firstFrameUrl,
        resolution: params.resolution ?? "1080p",
        duration: Math.trunc(params.durationSeconds ?? 5)
      })
    });
    return waitForKlingResult(this.requireApiKey(), taskId, {
      timeoutMs:
        params.timeoutSeconds == null
          ? undefined
          : Math.trunc(params.timeoutSeconds * 1000)
    });
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("kling media provider does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("kling media provider does not support chat streaming");
  }
}

function imageDataUrls(images: Uint8Array[]): string[] {
  return images
    .filter((image) => image.length > 0)
    .map((image) => createDataUrl(image, inferImageMime(image, "image/png")));
}
