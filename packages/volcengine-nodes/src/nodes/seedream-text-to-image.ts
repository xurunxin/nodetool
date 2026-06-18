import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  buildSeedreamBody,
  generateSeedreamImage,
  getArkApiKey,
  imageRefFromBytes
} from "../volcengine-base.js";

export const SEEDREAM_MODELS = [
  "doubao-seedream-5-0-260128",
  "doubao-seedream-4-0-250828"
];
export const SEEDREAM_SIZES = [
  "1024x1024",
  "1280x720",
  "720x1280",
  "1024x768",
  "768x1024"
];

export class SeedreamTextToImageNode extends BaseNode {
  static readonly nodeType = "volcengine.SeedreamTextToImage";
  static readonly body = "content_card";
  static readonly title = "Seedream Text to Image";
  static readonly description =
    "Generate images from text using Volcengine Ark Seedream.\n" +
    "volcengine, ark, seedream, image, text-to-image";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly requiredSettings = ["ARK_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: "doubao-seedream-5-0-260128",
    title: "Model",
    description: "The Volcengine Ark Seedream model to use.",
    values: SEEDREAM_MODELS
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
    default: "1024x1024",
    title: "Size",
    description: "Output image size.",
    values: SEEDREAM_SIZES
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
    type: "bool",
    default: true,
    title: "Optimize Prompt",
    description: "Let Seedream optimize the prompt."
  })
  declare optimize_prompt: unknown;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getArkApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    const bytes = await generateSeedreamImage(
      apiKey,
      buildSeedreamBody({
        model: String(this.model ?? "doubao-seedream-5-0-260128"),
        prompt,
        size: String(this.size ?? "1024x1024"),
        responseFormat: "url",
        watermark: Boolean(this.watermark ?? false),
        optimizePrompt: Boolean(this.optimize_prompt ?? true)
      })
    );
    return { output: imageRefFromBytes(bytes) };
  }
}

export const SEEDREAM_TEXT_TO_IMAGE_NODES: readonly NodeClass[] = [
  SeedreamTextToImageNode
];
