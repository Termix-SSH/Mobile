import { reloadAppAsync } from "expo";
import {
  LANGUAGES,
  resolveLanguage,
  saveLanguage,
  savedLanguage,
  t,
} from "./index";

export interface LanguageOption {
  value: string;
  label: string;
  description?: string;
}

/** "Same as the device", English, then every translated language. */
export function languageOptions(): LanguageOption[] {
  return [
    { value: "system", label: t("settings.language.system") },
    { value: "en", label: "English" },
    ...LANGUAGES.map((l) => ({
      value: l.code,
      label: l.label,
      description: l.name,
    })),
  ];
}

/** The name of the language the app shows now, in that language. */
export function currentLanguageLabel(): string {
  const code = resolveLanguage();
  if (code === "en") return "English";
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Saves the choice and reloads, since text is read once at start. */
export function switchLanguage(code: string): void {
  if (code === savedLanguage()) return;
  saveLanguage(code);
  void reloadAppAsync();
}
