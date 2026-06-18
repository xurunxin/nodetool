import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  buildWanxVideoBody,
  getDashScopeApiKey,
  submitWanxVideoTask,
  videoRefFromBytes,
  waitForWanxVideoResult
} from "../dashscope-base.js";
import { imageRefToDashScopeUrl } from "./media-ref.js";

export const WANX_IMAGE_TO_VIDEO_MODEL = "wan2.7-i2v-2026-04-25";
export const WANX_VIDEO_MODELS = [WANX_IMAGE_TO_VIDEO_MODEL];
export const WANX_VIDEO_RESOLUTIONS = ["720P", "1080P"];
export const WANX_VIDEO_DURATIONS = [5, 10];

export class WanxImageToVideoNode extends BaseNode {
  static readonly nodeType = "dashscope.WanxImageToVideo";
  static readonly body = "content_card";
  static readonly title = "Wanxiang Image to Video";
  static readonly description =
    "Animate a reference image into video using DashScope Wanxiang.\n" +
    "dashscope, alibaba, model studio, wanxiang, video, image-to-video";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["image", "prompt"];
  static readonly requiredSettings = ["DASHSCOPE_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: WANX_IMAGE_TO_VIDEO_MODEL,
    title: "Model",
    description: "The DashScope Wanxiang video model to use.",
    values: WANX_VIDEO_MODELS
  })
  declare model: unknown;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null },
    title: "Image",
    description: "First frame image to animate."
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
    default: "1080P",
    title: "Resolution",
    description: "Output resolution.",
    values: WANX_VIDEO_RESOLUTIONS
  })
  declare resolution: unknown;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds.",
    values: WANX_VIDEO_DURATIONS
  })
  declare duration: unknown;

  @prop({
    type: "bool",
    default: true,
    title: "Prompt Extend",
    description: "Let DashScope expand the prompt."
  })
  declare prompt_extend: unknown;

  @prop({
    type: "bool",
    default: false,
    title: "Watermark",
    description: "Whether to apply a provider watermark."
  })
  declare watermark: unknown;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed. Negative values omit the seed."
  })
  declare seed: unknown;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const apiKey = getDashScopeApiKey(this._secrets);
    const prompt = String(this.prompt ?? "").trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const imageUrl = await imageRefToDashScopeUrl(this.image, context);
    if (!imageUrl) {
      throw new Error("A reference image is required");
    }
    const seed = Number(this.seed ?? -1);

    const taskId = await submitWanxVideoTask(
      apiKey,
      buildWanxVideoBody({
        model: String(this.model ?? WANX_IMAGE_TO_VIDEO_MODEL),
        prompt,
        resources: [{ type: "image", alias: "first_frame", url: imageUrl }],
        resolution: String(this.resolution ?? "1080P"),
        duration: Number(this.duration ?? 5),
        promptExtend: Boolean(this.prompt_extend ?? true),
        watermark: Boolean(this.watermark ?? false),
        ...(Number.isFinite(seed) && seed >= 0 ? { seed } : {})
      })
    );
    const bytes = await waitForWanxVideoResult(apiKey, taskId);
    return { output: videoRefFromBytes(bytes) };
  }
}

export const WANX_IMAGE_TO_VIDEO_NODES: readonly NodeClass[] = [
  WanxImageToVideoNode
];
