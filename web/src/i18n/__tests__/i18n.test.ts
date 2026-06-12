import i18n, {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  translate
} from "../index";

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

  it("returns the key for missing translations", () => {
    expect(translate("common:notARealKey")).toBe("notARealKey");
  });
});
