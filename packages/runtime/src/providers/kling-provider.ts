import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { BaseProvider } from "./base-provider.js";
import type {
  ImageModel,
  Message,
  ProviderStreamItem,
  VideoModel
} from "./types.js";

const IMAGE_MODELS: ImageModel[] = [
  {
    id: "kling-image-3-0",
    name: "Kling Image 3.0",
    provider: PROVIDER_IDS.KLING,
    supportedTasks: ["text_to_image", "image_to_image"]
  }
];

const VIDEO_MODELS: VideoModel[] = [
  {
    id: "kling-3.0-turbo",
    name: "Kling 3.0 Turbo",
    provider: PROVIDER_IDS.KLING,
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "kling-3.0-omni",
    name: "Kling 3.0 Omni",
    provider: PROVIDER_IDS.KLING,
    supportedTasks: ["text_to_video", "image_to_video"]
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

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return IMAGE_MODELS;
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return VIDEO_MODELS;
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
