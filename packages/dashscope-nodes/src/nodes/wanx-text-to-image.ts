import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  buildWanxImageBody,
  generateWanxImage,
  getDashScopeApiKey,
  imageRefFromBytes
} from "../dashscope-base.js";

export const WANX_IMAGE_MODELS = ["wan2.7-image", "wan2.7-image-pro"];
export const WANX_IMAGE_SIZES = [
  "1024*1024",
  "1280*720",
  "720*1280",
  "1024*768",
  "768*1024"
];

export class WanxTextToImageNode extends BaseNode {
  static readonly nodeType = "dashscope.WanxTextToImage";
  static readonly body = "content_card";
  static readonly title = "Wanxiang Text to Image";
  static readonly description =
    "Generate images from text using Alibaba Model Studio DashScope Wanxiang.\n" +
    "dashscope, alibaba, model studio, wanxiang, image, text-to-image";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly requiredSettings = ["DASHSCOPE_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: "wan2.7-image",
    title: "Model",
    description: "The DashScope Wanxiang image model to use.",
    values: WANX_IMAGE_MODELS
  })
  declare model: unknown;

  @prop({
    type: "str",
    default: "A product poster with clean typography",
    title: "Prompt",
    description: "Text prompt describing the image."
  })
  declare prompt: unknown;

  @prop({
    type: "enum",
    default: "1024*1024",
    title: "Size",
    description: "Output image size.",
    values: WANX_IMAGE_SIZES
  })
  declare size: unknown;

  @prop({
    type: "int",
    default: 1,
    title: "Images",
    description: "Number of images to request."
  })
  declare n: unknown;

  @prop({
    type: "bool",
    default: false,
    title: "Watermark",
    description: "Whether to apply a provider watermark."
  })
  declare watermark: unknown;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getDashScopeApiKey(this._secrets);
    const prompt = String(this.prompt ?? "").trim();
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    const bytes = await generateWanxImage(
      apiKey,
      buildWanxImageBody({
        model: String(this.model ?? "wan2.7-image"),
        prompt,
        size: String(this.size ?? "1024*1024"),
        n: Number(this.n ?? 1),
        watermark: Boolean(this.watermark ?? false)
      })
    );
    return { output: imageRefFromBytes(bytes) };
  }
}

export const WANX_TEXT_TO_IMAGE_NODES: readonly NodeClass[] = [
  WanxTextToImageNode
];
