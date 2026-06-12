export const DEFAULT_LANGUAGE = "zh-CN" as const;
export const FALLBACK_LANGUAGE = "en" as const;

export const SUPPORTED_LANGUAGES = [DEFAULT_LANGUAGE, FALLBACK_LANGUAGE] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_NAMESPACE = "common" as const;

export const NAMESPACES = [
  "common",
  "startup",
  "login",
  "workspace",
  "navigation",
  "workflows",
  "assets",
  "models",
  "chat",
  "settings",
  "errors"
] as const;

export type TranslationNamespace = (typeof NAMESPACES)[number];
