import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  registerVolcengineNodes,
  VOLCENGINE_NODES
} from "../src/index.js";

describe("registerVolcengineNodes", () => {
  it("registers all Volcengine Ark nodes", () => {
    const registry = new NodeRegistry();

    registerVolcengineNodes(registry);

    expect(VOLCENGINE_NODES.map((node) => node.nodeType).sort()).toEqual([
      "volcengine.SeedanceImageToVideo",
      "volcengine.SeedanceTextToVideo",
      "volcengine.SeedreamImageEdit",
      "volcengine.SeedreamTextToImage"
    ]);
    for (const node of VOLCENGINE_NODES) {
      expect(registry.has(node.nodeType)).toBe(true);
    }
  });
});
