import { createInstance, type TOptions } from "i18next";
import { getLocales } from "expo-localization";
import Storage from "expo-sqlite/kv-store";
import en from "./locales/en.json";
import languages from "./locales/languages.json";
import { BUNDLES } from "./bundles";

export interface Language {
  code: string;
  file: string;
  name: string;
  label: string;
}

export const LANGUAGES: Language[] = languages;

const KEY = "app.language";

/** "system" follows the device, anything else is a code from LANGUAGES. */
export function savedLanguage(): string {
  try {
    const value = Storage.getItemSync(KEY);
    if (value && (value === "system" || BUNDLES[value])) return value;
  } catch {
    // No storage (tests, first start): follow the device.
  }
  return "system";
}

export function saveLanguage(code: string): void {
  Storage.setItemSync(KEY, code);
}

/** The best LANGUAGES code for a BCP 47 tag like "pt-BR" or "zh-Hant-TW". */
export function matchLanguage(tag: string): string | undefined {
  const parts = tag.replace(/_/g, "-").split("-");
  const lang = parts[0]?.toLowerCase();
  if (!lang) return undefined;
  if (lang === "en") return "en";
  const rest = parts.slice(1).map((p) => p.toUpperCase());
  if (lang === "zh") {
    const traditional =
      rest.includes("HANT") || rest.some((p) => ["TW", "HK", "MO"].includes(p));
    return traditional ? "zh-TW" : "zh-CN";
  }
  if (lang === "nb" || lang === "nn") return "no";
  const codes = Object.keys(BUNDLES);
  const exact = codes.find((c) => c.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const region = rest.find((p) => p.length === 2);
  if (region) {
    const withRegion = codes.find((c) => c === `${lang}-${region}`);
    if (withRegion) return withRegion;
  }
  if (BUNDLES[lang]) return lang;
  if (lang === "pt") return "pt-PT";
  return codes.find((c) => c.split("-")[0] === lang);
}

function systemLanguage(): string {
  try {
    for (const locale of getLocales()) {
      const code = matchLanguage(locale.languageTag);
      if (code) return code;
    }
  } catch {
    // Not available in tests.
  }
  return "en";
}

/** The language the app shows now. */
export function resolveLanguage(choice = savedLanguage()): string {
  return choice === "system" ? systemLanguage() : choice;
}

const lng = resolveLanguage();
const resources: Record<string, { translation: Record<string, unknown> }> = {
  en: { translation: en },
};
if (lng !== "en" && BUNDLES[lng]) {
  try {
    resources[lng] = { translation: BUNDLES[lng]() };
  } catch {
    // A broken file falls back to English.
  }
}

// Its own instance, so the plugin host's i18next never shares it.
const i18n = createInstance();
void i18n.init({
  lng,
  fallbackLng: "en",
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

/**
 * Text for `key`. The app reloads when the language changes, so plain calls
 * at module level are fine.
 */
export function t(key: string, options?: TOptions): string {
  return i18n.t(key, options) as string;
}

export { i18n };
