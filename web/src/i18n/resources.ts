import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE } from "./languages";
import { en } from "./locales/en";
import { zhCN } from "./locales/zhCN";

export const resources = {
  [DEFAULT_LANGUAGE]: zhCN,
  [FALLBACK_LANGUAGE]: en
} as const;
