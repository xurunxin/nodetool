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
