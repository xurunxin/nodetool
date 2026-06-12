import i18n, { type TOptions } from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  DEFAULT_NAMESPACE,
  NAMESPACES,
  SUPPORTED_LANGUAGES
} from "./languages";
import { resources } from "./resources";
import { isLocalhost } from "../lib/env";

export {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  DEFAULT_NAMESPACE,
  NAMESPACES,
  SUPPORTED_LANGUAGES
} from "./languages";
export type { SupportedLanguage, TranslationNamespace } from "./languages";

const isTest =
  typeof process !== "undefined" && process.env.NODE_ENV === "test";
const isDev =
  isLocalhost && !isTest;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [DEFAULT_LANGUAGE, FALLBACK_LANGUAGE],
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: DEFAULT_NAMESPACE,
    resources,
    debug: isDev,
    initAsync: false,
    returnNull: false,
    saveMissing: isDev,
    missingKeyHandler: (_lngs, ns, key) => {
      if (isDev) {
        console.warn(`[i18n] Missing translation: ${ns}:${key}`);
      }
    },
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });
}

export const translate = (key: string, options?: TOptions): string =>
  i18n.t(key, options);

export default i18n;
