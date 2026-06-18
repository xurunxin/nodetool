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

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return IMAGE_MODELS;
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return VIDEO_MODELS;
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
