import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  buildWanxImageBody,
  generateWanxImage,
  getDashScopeApiKey,
  imageRefFromBytes
} from "../dashscope-base.js";
import { imageRefsToDashScopeUrls } from "./media-ref.js";
import { WANX_IMAGE_MODELS, WANX_IMAGE_SIZES } from "./wanx-text-to-image.js";

export const WANX_THINKING_MODES = ["enabled", "disabled"];

export class WanxImageEditNode extends BaseNode {
  static readonly nodeType = "dashscope.WanxImageEdit";
  static readonly body = "content_card";
  static readonly title = "Wanxiang Image Edit";
  static readonly description =
    "Edit or remix one or more reference images using DashScope Wanxiang.\n" +
    "dashscope, alibaba, model studio, wanxiang, image, edit, reference";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["images", "prompt"];
  static readonly requiredSettings = ["DASHSCOPE_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: "wan2.7-image-pro",
    title: "Model",
    description: "The DashScope Wanxiang image model to use.",
    values: WANX_IMAGE_MODELS
  })
  declare model: unknown;

  @prop({
    type: "str",
    default: "Apply the requested edit while preserving identity",
    title: "Prompt",
    description: "Edit instruction or image prompt."
  })
  declare prompt: unknown;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description: "Reference image or images for Wanxiang."
  })
  declare images: unknown;

  @prop({
    type: "enum",
    default: "1024*1024",
    title: "Size",
    description: "Output image size.",
    values: WANX_IMAGE_SIZES
  })
  declare size: unknown;

  @prop({
    type: "bool",
    default: false,
    title: "Watermark",
    description: "Whether to apply a provider watermark."
  })
  declare watermark: unknown;

  @prop({
    type: "enum",
    default: "enabled",
    title: "Thinking Mode",
    description: "Wanxiang image reasoning mode when supported by the model.",
    values: WANX_THINKING_MODES
  })
  declare thinking_mode: unknown;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const apiKey = getDashScopeApiKey(this._secrets);
    const prompt = String(this.prompt ?? "").trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const imageUrls = await imageRefsToDashScopeUrls(this.images, context);
    if (imageUrls.length === 0) {
      throw new Error("At least one reference image is required");
    }

    const bytes = await generateWanxImage(
      apiKey,
      buildWanxImageBody({
        model: String(this.model ?? "wan2.7-image-pro"),
        prompt,
        imageUrls,
        size: String(this.size ?? "1024*1024"),
        watermark: Boolean(this.watermark ?? false),
        thinkingMode: String(this.thinking_mode ?? "enabled")
      })
    );
    return { output: imageRefFromBytes(bytes) };
  }
}

export const WANX_IMAGE_EDIT_NODES: readonly NodeClass[] = [
  WanxImageEditNode
];
