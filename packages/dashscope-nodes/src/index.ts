import type { NodeClass } from "@nodetool-ai/node-sdk";
import { WANX_IMAGE_EDIT_NODES } from "./nodes/wanx-image-edit.js";
import { WANX_IMAGE_TO_VIDEO_NODES } from "./nodes/wanx-image-to-video.js";
import { WANX_TEXT_TO_IMAGE_NODES } from "./nodes/wanx-text-to-image.js";

export { WanxImageEditNode } from "./nodes/wanx-image-edit.js";
export { WanxImageToVideoNode } from "./nodes/wanx-image-to-video.js";
export { WanxTextToImageNode } from "./nodes/wanx-text-to-image.js";

export const DASHSCOPE_NODES: readonly NodeClass[] = [
  ...WANX_IMAGE_TO_VIDEO_NODES,
  ...WANX_TEXT_TO_IMAGE_NODES,
  ...WANX_IMAGE_EDIT_NODES
];

export function registerDashScopeNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of DASHSCOPE_NODES) {
    registry.register(nodeClass);
  }
}
