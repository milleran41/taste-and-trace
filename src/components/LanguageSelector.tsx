import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const LANGUAGES = [
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

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        title={currentLang.label}
      >
        <Globe className="h-5 w-5" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-popover text-popover-foreground shadow-lg z-50 py-1 max-h-80 overflow-y-auto animate-in fade-in-0 zoom-in-95">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                i18n.changeLanguage(lang.code);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                i18n.language === lang.code && "bg-accent/50 font-medium"
              )}
            >
              <span className="text-base">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
