import { useState } from "react";
import { Link } from "react-router-dom";
import { ChefHat, Plus, Heart, Link2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { URLImportModal } from "@/components/URLImportModal";
import { GuideModal } from "@/components/GuideModal";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTranslation } from "react-i18next";

export function Header() {
  const [importOpen, setImportOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <ChefHat className="h-8 w-8 text-primary" />
            <span className="font-display text-xl font-semibold">YumBook</span>
          </Link>
          
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/?favorites=true">
                <Heart className="h-5 w-5" />
                <span className="sr-only">{t("favorites")}</span>
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Link2 className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t("from_link")}</span>
            </Button>
            <Button asChild>
              <Link to="/add">
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">{t("add_recipe")}</span>
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setGuideOpen(true)} title={t("guide")}>
              <HelpCircle className="h-5 w-5" />
            </Button>
            <LanguageSelector />
          </nav>
        </div>
      </header>
      <URLImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
