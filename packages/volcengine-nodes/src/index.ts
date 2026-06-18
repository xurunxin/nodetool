import type { NodeClass } from "@nodetool-ai/node-sdk";
import { SEEDANCE_IMAGE_TO_VIDEO_NODES } from "./nodes/seedance-image-to-video.js";
import { SEEDANCE_TEXT_TO_VIDEO_NODES } from "./nodes/seedance-text-to-video.js";
import { SEEDREAM_IMAGE_EDIT_NODES } from "./nodes/seedream-image-edit.js";
import { SEEDREAM_TEXT_TO_IMAGE_NODES } from "./nodes/seedream-text-to-image.js";

export { SeedanceImageToVideoNode } from "./nodes/seedance-image-to-video.js";
export { SeedanceTextToVideoNode } from "./nodes/seedance-text-to-video.js";
export { SeedreamImageEditNode } from "./nodes/seedream-image-edit.js";
export { SeedreamTextToImageNode } from "./nodes/seedream-text-to-image.js";

export const VOLCENGINE_NODES: readonly NodeClass[] = [
  ...SEEDANCE_TEXT_TO_VIDEO_NODES,
  ...SEEDANCE_IMAGE_TO_VIDEO_NODES,
  ...SEEDREAM_TEXT_TO_IMAGE_NODES,
  ...SEEDREAM_IMAGE_EDIT_NODES
];

export function registerVolcengineNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of VOLCENGINE_NODES) {
    registry.register(nodeClass);
  }
}
