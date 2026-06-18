import { describe, expect, it } from "vitest";
import { getRegisteredSettings } from "../src/settings-registry.js";

describe("settings registry China media provider secrets", () => {
  it("registers DashScope, Volcengine Ark, and Kling API keys as secrets", () => {
    const settingsByKey = new Map(
      getRegisteredSettings().map((setting) => [setting.envVar, setting])
    );

    expect(settingsByKey.get("DASHSCOPE_API_KEY")).toMatchObject({
      group: "DashScope",
      isSecret: true
    });
    expect(settingsByKey.get("ARK_API_KEY")).toMatchObject({
      group: "Volcengine Ark",
      isSecret: true
    });
    expect(settingsByKey.get("KLING_API_KEY")).toMatchObject({
      group: "Kling",
      isSecret: true
    });
  });
});
