import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { APP_LANGUAGES } from "@/utils/languages";

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

  const currentLang = APP_LANGUAGES.find((language) => language.code === i18n.language) || APP_LANGUAGES[0];

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
          {APP_LANGUAGES.map((language) => (
            <button
              key={language.code}
              onClick={() => {
                i18n.changeLanguage(language.code);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                i18n.language === language.code && "bg-accent/50 font-medium"
              )}
            >
              <span className="text-base">{language.flag}</span>
              <span>{language.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

