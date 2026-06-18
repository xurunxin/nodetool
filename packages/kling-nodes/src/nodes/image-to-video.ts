import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import {
  bytesToBase64
} from "@nodetool-ai/nodes-utils";
import {
  createDataUrl,
  inferImageMime
} from "@nodetool-ai/nodes-utils/china-media";
import {
  buildKlingImageToVideoBody,
  getKlingApiKey,
  KLING_IMAGE_TO_VIDEO_MODEL,
  KLING_IMAGE_TO_VIDEO_MODELS,
  submitKlingTask,
  waitForKlingResult
} from "../kling-base.js";

export class KlingImageToVideoNode extends BaseNode {
  static readonly nodeType = "kling.ImageToVideo";
  static readonly body = "content_card";
  static readonly title = "Kling Image to Video";
  static readonly description =
    "Animate a first-frame image into a video with Kling 3.0 Turbo.\n" +
    "kling, video, generation, image-to-video, i2v";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["image", "prompt"];
  static readonly requiredSettings = ["KLING_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: KLING_IMAGE_TO_VIDEO_MODEL,
    title: "Model",
    description: "The Kling image-to-video model endpoint to use.",
    values: KLING_IMAGE_TO_VIDEO_MODELS
  })
  declare model: any;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null },
    title: "Image",
    description: "The image to use as the first frame."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text prompt describing the desired motion."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds.",
    min: 1
  })
  declare duration: any;

  @prop({
    type: "str",
    default: "1080p",
    title: "Resolution",
    description: "Output resolution passed to Kling settings."
  })
  declare resolution: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const apiKey = getKlingApiKey(this._secrets);
    const firstFrameUrl = await resolveFirstFrameUrl(this.image, context);
    if (!firstFrameUrl) {
      throw new Error("A first-frame image is required");
    }

    const model = String(this.model ?? KLING_IMAGE_TO_VIDEO_MODEL);
    const body = buildKlingImageToVideoBody({
      prompt: String(this.prompt ?? ""),
      firstFrameUrl,
      resolution: String(this.resolution ?? "1080p"),
      duration: Number(this.duration ?? 5)
    });
    const taskId = await submitKlingTask({
      apiKey,
      path: `/image-to-video/${model}`,
      body
    });
    const bytes = await waitForKlingResult(apiKey, taskId);

    return { output: videoRefFromBytes(bytes) };
  }
}

export const IMAGE_TO_VIDEO_NODES: readonly NodeClass[] = [
  KlingImageToVideoNode
];

function videoRefFromBytes(bytes: Uint8Array): { type: "video"; data: string } {
  return { type: "video", data: bytesToBase64(bytes) };
}

async function resolveFirstFrameUrl(
  image: Record<string, unknown>,
  context?: ProcessingContext
): Promise<string | null> {
  const uri = typeof image?.uri === "string" ? image.uri : "";
  if (
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("data:")
  ) {
    return uri;
  }

  const bytes = await loadMediaRefBytes(image, context);
  if (!bytes || bytes.length === 0) {
    return null;
  }
  return createDataUrl(bytes, inferImageMime(bytes, "image/png"));
}
