import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  buildSeedreamBody,
  generateSeedreamImage,
  getArkApiKey,
  imageRefFromBytes
} from "../volcengine-base.js";
import { imageRefsToArkUrls } from "./media-ref.js";
import { SEEDREAM_MODELS, SEEDREAM_SIZES } from "./seedream-text-to-image.js";

export class SeedreamImageEditNode extends BaseNode {
  static readonly nodeType = "volcengine.SeedreamImageEdit";
  static readonly body = "content_card";
  static readonly title = "Seedream Image Edit";
  static readonly description =
    "Edit or remix one or more reference images using Volcengine Ark Seedream.\n" +
    "volcengine, ark, seedream, image, edit, reference";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["images", "prompt"];
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
    default: "Apply the requested edit while preserving identity",
    title: "Prompt",
    description: "Edit instruction or image prompt."
  })
  declare prompt: unknown;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description: "Reference image or images for Seedream."
  })
  declare images: unknown;

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const apiKey = getArkApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    const imageUrls = await imageRefsToArkUrls(this.images, context);
    if (imageUrls.length === 0) {
      throw new Error("At least one reference image is required");
    }

    const bytes = await generateSeedreamImage(
      apiKey,
      buildSeedreamBody({
        model: String(this.model ?? "doubao-seedream-5-0-260128"),
        prompt,
        imageUrls,
        size: String(this.size ?? "1024x1024"),
        responseFormat: "url",
        watermark: Boolean(this.watermark ?? false),
        optimizePrompt: Boolean(this.optimize_prompt ?? true)
      })
    );
    return { output: imageRefFromBytes(bytes) };
  }
}

export const SEEDREAM_IMAGE_EDIT_NODES: readonly NodeClass[] = [
  SeedreamImageEditNode
];
