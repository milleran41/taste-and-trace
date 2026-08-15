export const APP_LANGUAGES = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "pl", flag: "🇵🇱", label: "Polski" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
  { code: "uk", flag: "🇺🇦", label: "Українська" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "ar", flag: "🇸🇦", label: "العربية" },
  { code: "hi", flag: "🇮🇳", label: "हिन्दी" },
];

export function getLanguageLabel(code?: string | null): string {
  if (!code) return "Original";
  return APP_LANGUAGES.find((language) => language.code === code)?.label || code.toUpperCase();
}

