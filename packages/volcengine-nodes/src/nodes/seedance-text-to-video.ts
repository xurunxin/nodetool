import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  buildSeedanceContent,
  getArkApiKey,
  submitSeedanceTask,
  videoRefFromBytes,
  waitForSeedanceResult
} from "../volcengine-base.js";

export const SEEDANCE_MODELS = [
  "doubao-seedance-2-0-260128",
  "doubao-seedance-2-0-pro-250528"
];
export const SEEDANCE_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
export const SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p"];
export const SEEDANCE_DURATIONS = [5, 10];

export class SeedanceTextToVideoNode extends BaseNode {
  static readonly nodeType = "volcengine.SeedanceTextToVideo";
  static readonly body = "content_card";
  static readonly title = "Seedance Text to Video";
  static readonly description =
    "Generate video from a text prompt using Volcengine Ark Seedance 2.0.\n" +
    "volcengine, ark, seedance, video, text-to-video";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly requiredSettings = ["ARK_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: "doubao-seedance-2-0-260128",
    title: "Model",
    description: "The Volcengine Ark Seedance model to use.",
    values: SEEDANCE_MODELS
  })
  declare model: unknown;

  @prop({
    type: "str",
    default: "A cinematic tracking shot of a city at sunrise",
    title: "Prompt",
    description: "Text prompt describing the video."
  })
  declare prompt: unknown;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Ratio",
    description: "Output aspect ratio.",
    values: SEEDANCE_RATIOS
  })
  declare ratio: unknown;

  @prop({
    type: "enum",
    default: "1080p",
    title: "Resolution",
    description: "Output resolution.",
    values: SEEDANCE_RESOLUTIONS
  })
  declare resolution: unknown;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds.",
    values: SEEDANCE_DURATIONS
  })
  declare duration: unknown;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "-1 lets Ark choose a seed.",
    min: -1
  })
  declare seed: unknown;

  @prop({
    type: "bool",
    default: true,
    title: "Generate Audio",
    description: "Ask Seedance to generate matching audio when supported."
  })
  declare generate_audio: unknown;

  @prop({
    type: "bool",
    default: false,
    title: "Watermark",
    description: "Whether to apply a provider watermark."
  })
  declare watermark: unknown;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getArkApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    const body: Record<string, unknown> = {
      model: String(this.model ?? "doubao-seedance-2-0-260128"),
      content: buildSeedanceContent(prompt),
      ratio: String(this.ratio ?? "16:9"),
      duration: Number(this.duration ?? 5),
      resolution: String(this.resolution ?? "1080p"),
      generate_audio: Boolean(this.generate_audio ?? true),
      watermark: Boolean(this.watermark ?? false)
    };
    const seed = Number(this.seed ?? -1);
    if (Number.isFinite(seed) && seed >= 0) {
      body.seed = seed;
    }

    const taskId = await submitSeedanceTask(apiKey, body);
    const bytes = await waitForSeedanceResult(apiKey, taskId);
    return { output: videoRefFromBytes(bytes) };
  }
}

export const SEEDANCE_TEXT_TO_VIDEO_NODES: readonly NodeClass[] = [
  SeedanceTextToVideoNode
];
