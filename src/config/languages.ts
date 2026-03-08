export interface Language {
  code: string;
  label: string;
  nativeLabel: string;
  dir?: "ltr" | "rtl";
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "pl", label: "Polish", nativeLabel: "Polski" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "uk", label: "Ukrainian", nativeLabel: "Українська" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
];

export const FALLBACK_LANGUAGE = "en";

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

export function getLanguageByCode(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}
