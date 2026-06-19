import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CLI built-in media pack registration", () => {
  it("imports and registers the Volcengine Ark node pack", () => {
    const source = readFileSync("src/nodetool.ts", "utf8");

    expect(source).toContain(
      'import { registerVolcengineNodes } from "@nodetool-ai/volcengine-nodes";'
    );
    expect(source).toContain("registerVolcengineNodes(registry);");
  });

  it("declares the Volcengine node package dependency", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.["@nodetool-ai/volcengine-nodes"]).toBe("*");
  });
});
