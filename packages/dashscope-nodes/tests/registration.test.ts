import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  DASHSCOPE_NODES,
  registerDashScopeNodes
} from "../src/index.js";

describe("registerDashScopeNodes", () => {
  it("registers all DashScope Wanxiang nodes", () => {
    const registry = new NodeRegistry();

    registerDashScopeNodes(registry);

    expect(DASHSCOPE_NODES.map((node) => node.nodeType).sort()).toEqual([
      "dashscope.WanxImageEdit",
      "dashscope.WanxImageToVideo",
      "dashscope.WanxTextToImage"
    ]);
    for (const node of DASHSCOPE_NODES) {
      expect(registry.has(node.nodeType)).toBe(true);
    }
  });
});
