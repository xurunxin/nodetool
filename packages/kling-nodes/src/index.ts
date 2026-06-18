import type { NodeClass } from "@nodetool-ai/node-sdk";
import { IMAGE_TO_VIDEO_NODES } from "./nodes/image-to-video.js";

export { KlingImageToVideoNode } from "./nodes/image-to-video.js";

export const KLING_NODES: readonly NodeClass[] = [...IMAGE_TO_VIDEO_NODES];

export function registerKlingNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of KLING_NODES) {
    registry.register(nodeClass);
  }
}
