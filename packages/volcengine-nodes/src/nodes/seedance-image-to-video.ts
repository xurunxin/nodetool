import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  buildSeedanceContent,
  getArkApiKey,
  submitSeedanceTask,
  videoRefFromBytes,
  waitForSeedanceResult
} from "../volcengine-base.js";
import {
  SEEDANCE_DURATIONS,
  SEEDANCE_MODELS,
  SEEDANCE_RATIOS,
  SEEDANCE_RESOLUTIONS
} from "./seedance-text-to-video.js";
import { imageRefToArkUrl } from "./media-ref.js";

export class SeedanceImageToVideoNode extends BaseNode {
  static readonly nodeType = "volcengine.SeedanceImageToVideo";
  static readonly body = "content_card";
  static readonly title = "Seedance Image to Video";
  static readonly description =
    "Animate a reference image into video using Volcengine Ark Seedance 2.0.\n" +
    "volcengine, ark, seedance, video, image-to-video";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["image", "prompt"];
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
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null },
    title: "Image",
    description: "Reference image to animate."
  })
  declare image: unknown;

  @prop({
    type: "str",
    default: "Slow cinematic motion with natural lighting",
    title: "Prompt",
    description: "Text prompt describing the desired motion."
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
    type: "bool",
    default: false,
    title: "Watermark",
    description: "Whether to apply a provider watermark."
  })
  declare watermark: unknown;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const apiKey = getArkApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const imageUrl = await imageRefToArkUrl(this.image, context);
    if (!imageUrl) {
      throw new Error("A reference image is required");
    }

    const body: Record<string, unknown> = {
      model: String(this.model ?? "doubao-seedance-2-0-260128"),
      content: buildSeedanceContent(prompt, [
        { type: "image", url: imageUrl }
      ]),
      ratio: String(this.ratio ?? "16:9"),
      duration: Number(this.duration ?? 5),
      resolution: String(this.resolution ?? "1080p"),
      watermark: Boolean(this.watermark ?? false)
    };

    const taskId = await submitSeedanceTask(apiKey, body);
    const bytes = await waitForSeedanceResult(apiKey, taskId);
    return { output: videoRefFromBytes(bytes) };
  }
}

export const SEEDANCE_IMAGE_TO_VIDEO_NODES: readonly NodeClass[] = [
  SeedanceImageToVideoNode
];
