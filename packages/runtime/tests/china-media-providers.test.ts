import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { providerCapabilities } from "../src/providers/base-provider.js";
import {
  getProvider,
  listRegisteredProviderIds
} from "../src/providers/index.js";

const CHINA_MEDIA_PROVIDERS = [
  {
    id: PROVIDER_IDS.DASHSCOPE,
    secretKey: "DASHSCOPE_API_KEY"
  },
  {
    id: PROVIDER_IDS.VOLCENGINE_ARK,
    secretKey: "ARK_API_KEY"
  },
  {
    id: PROVIDER_IDS.KLING,
    secretKey: "KLING_API_KEY"
  }
] as const;

describe("China media providers", () => {
  it("defines stable provider ids", () => {
    expect(PROVIDER_IDS.DASHSCOPE).toBe("dashscope");
    expect(PROVIDER_IDS.VOLCENGINE_ARK).toBe("volcengine_ark");
    expect(PROVIDER_IDS.KLING).toBe("kling");
  });

  it("registers each provider and creates it with its matching API key", async () => {
    const registeredIds = listRegisteredProviderIds();

    for (const provider of CHINA_MEDIA_PROVIDERS) {
      expect(registeredIds).toContain(provider.id);

      const instance = await getProvider(provider.id, async (key) =>
        key === provider.secretKey ? "test-key" : undefined
      );

      expect(instance.provider).toBe(provider.id);
      expect(instance.getContainerEnv()[provider.secretKey]).toBe("test-key");
    }
  });

  it("exposes non-empty image and video model lists for each provider", async () => {
    for (const provider of CHINA_MEDIA_PROVIDERS) {
      const instance = await getProvider(provider.id, async (key) =>
        key === provider.secretKey ? "test-key" : undefined
      );

      const imageModels = await instance.getAvailableImageModels();
      const videoModels = await instance.getAvailableVideoModels();

      expect(imageModels.length).toBeGreaterThan(0);
      expect(videoModels.length).toBeGreaterThan(0);
      expect(imageModels.every((model) => model.provider === provider.id)).toBe(
        true
      );
      expect(videoModels.every((model) => model.provider === provider.id)).toBe(
        true
      );
    }
  });

  it("does not advertise generic media capabilities before execution methods exist", async () => {
    for (const provider of CHINA_MEDIA_PROVIDERS) {
      const instance = await getProvider(provider.id, async (key) =>
        key === provider.secretKey ? "test-key" : undefined
      );

      const capabilities = providerCapabilities(instance);

      expect(capabilities).not.toContain("text_to_image");
      expect(capabilities).not.toContain("image_to_image");
      expect(capabilities).not.toContain("text_to_video");
      expect(capabilities).not.toContain("image_to_video");
      expect(await instance.getAvailableImageModels()).not.toHaveLength(0);
      expect(await instance.getAvailableVideoModels()).not.toHaveLength(0);
    }
  });
});
