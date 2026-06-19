import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CLI DashScope built-in media pack registration", () => {
  it("imports and registers the DashScope Wanxiang node pack", () => {
    const source = readFileSync("src/nodetool.ts", "utf8");

    expect(source).toContain(
      'import { registerDashScopeNodes } from "@nodetool-ai/dashscope-nodes";'
    );
    expect(source).toContain("registerDashScopeNodes(registry);");
  });

  it("declares the DashScope node package dependency", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.["@nodetool-ai/dashscope-nodes"]).toBe("*");
  });
});
