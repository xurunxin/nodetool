import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  type SupportedLanguage
} from "./languages";
import { en, type LocaleResource } from "./locales/en";
import { zhCN } from "./locales/zhCN";

export const resources = {
  [DEFAULT_LANGUAGE]: zhCN,
  [FALLBACK_LANGUAGE]: en
} as const satisfies Record<SupportedLanguage, LocaleResource>;
