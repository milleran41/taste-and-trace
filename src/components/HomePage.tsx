import { useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, GripVertical, Heart, Link2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { URLImportModal } from "@/components/URLImportModal";
import culinaryBookHomeImage from "@/assets/culinary-book-home.jpg";

const steps = [
  {
    icon: Plus,
    titleKey: "home_step_add_title",
    textKey: "home_step_add_text",
  },
  {
    icon: FolderOpen,
    titleKey: "home_step_category_title",
    textKey: "home_step_category_text",
  },
  {
    icon: GripVertical,
    titleKey: "home_step_order_title",
    textKey: "home_step_order_text",
  },
  {
    icon: Heart,
    titleKey: "home_step_favorites_title",
    textKey: "home_step_favorites_text",
  },
];

export function HomePage() {
  const { t } = useTranslation();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative z-10 p-6 md:p-10 lg:p-12">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("home_badge")}
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight md:text-5xl">
              {t("home_title")}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              {t("home_description")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/add">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("add_recipe")}
                </Link>
              </Button>
              <Button variant="outline" type="button" onClick={() => setImportOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" />
                {t("from_link")}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/?favorites=true">
                  <Heart className="mr-2 h-4 w-4" />
                  {t("favorites")}
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative min-h-[360px] overflow-hidden bg-[#efe4d4]">
            <img
              src={culinaryBookHomeImage}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-center"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-card/35 via-transparent to-transparent" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article key={step.titleKey} className="rounded-lg border bg-card p-5 shadow-sm">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-semibold">{t(step.titleKey)}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(step.textKey)}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">{t("home_import_title")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("home_import_text")}
          </p>
          <Button variant="outline" type="button" onClick={() => setImportOpen(true)} className="mt-4">
            <Link2 className="mr-2 h-4 w-4" />
            {t("home_import_note")}
          </Button>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">{t("home_categories_title")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("home_categories_text")}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">{t("home_fast_start_title")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("home_fast_start_text")}
          </p>
        </div>
      </section>
    </div>
    <URLImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
