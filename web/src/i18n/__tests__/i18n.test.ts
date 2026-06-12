import i18n, {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  translate
} from "../index";

describe("web i18n", () => {
  it("defaults to zh-CN", () => {
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
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

  it("returns the key for missing translations", () => {
    expect(translate("common:notARealKey")).toBe("notARealKey");
  });
});
