import i18n, {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  translate
} from "../index";
import {
  localizeDataTypeLabel,
  localizeNodeTitle,
  localizePropertyName
} from "../nodeMetadataLocalization";

describe("web i18n", () => {
  it("defaults to zh-CN", () => {
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
  });

  it("uses the central supported language list", () => {
    expect(i18n.options.supportedLngs).toEqual([
      ...SUPPORTED_LANGUAGES,
      "cimode"
    ]);
  });

  it("translates bundled zh-CN resources", () => {
    expect(translate("common:refreshPage")).toBe("刷新页面");
  });

  it("falls back to English resources", async () => {
    try {
      await i18n.changeLanguage(FALLBACK_LANGUAGE);
      expect(translate("common:refreshPage")).toBe("Refresh Page");
    } finally {
      await i18n.changeLanguage(DEFAULT_LANGUAGE);
    }
  });

  it("interpolates named parameters", () => {
    expect(translate("assets:deleteFiles", { count: 3 })).toBe("删除 3 个文件？");
  });

  it("pluralizes independent asset delete counts in English", async () => {
    try {
      await i18n.changeLanguage(FALLBACK_LANGUAGE);
      expect(
        translate("assets:deleteFoldersAndFiles", {
          count: 3,
          folderCount: 1,
          folderLabel: translate("assets:folderLabel", { count: 1 }),
          fileCount: 2,
          fileLabel: translate("assets:fileLabel", { count: 2 }),
          itemCount: 3,
          itemLabel: translate("assets:itemLabel", { count: 3 })
        })
      ).toBe("Delete 1 folder and 2 files containing 3 items?");
    } finally {
      await i18n.changeLanguage(DEFAULT_LANGUAGE);
    }
  });

  it("pluralizes localized settings option counts", async () => {
    expect(translate("settings:minuteInterval", { count: 10 })).toBe(
      "10 分钟"
    );
    expect(translate("settings:versionCount", { count: 25 })).toBe(
      "25 个版本"
    );

    try {
      await i18n.changeLanguage(FALLBACK_LANGUAGE);
      expect(translate("settings:minuteInterval", { count: 1 })).toBe(
        "1 minute"
      );
      expect(translate("settings:versionCount", { count: 25 })).toBe(
        "25 versions"
      );
    } finally {
      await i18n.changeLanguage(DEFAULT_LANGUAGE);
    }
  });

  it("returns the key for missing translations", () => {
    expect(translate("common:notARealKey")).toBe("notARealKey");
  });

  it("localizes common node metadata display names", () => {
    expect(localizeNodeTitle("Image To Video")).toBe("图像转视频");
    expect(localizePropertyName("negative_prompt")).toBe("负面提示词");
    expect(localizePropertyName("num_inference_steps")).toBe("推理步数");
    expect(localizeDataTypeLabel("image")).toBe("图像");
  });

  it("leaves metadata identifiers unchanged in English mode", async () => {
    try {
      await i18n.changeLanguage(FALLBACK_LANGUAGE);
      expect(localizePropertyName("negative_prompt")).toBe("negative_prompt");
    } finally {
      await i18n.changeLanguage(DEFAULT_LANGUAGE);
    }
  });
});
