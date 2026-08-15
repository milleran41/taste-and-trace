import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, Heart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportModal } from "@/components/SupportModal";
import { cn } from "@/lib/utils";
import { promotions } from "@/data/promotions";
import supportQr from "@/assets/images/support-qr.png";

const pickPromotions = () => {
  return promotions
    .filter((promotion) => promotion.published)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
};

export function RightSidebar() {
  const [supportOpen, setSupportOpen] = useState(false);
  const { t } = useTranslation();
  const visiblePromotions = useMemo(() => pickPromotions(), []);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col gap-4 p-4 border-l border-border bg-card/50">
        {/* Support Author */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col items-center gap-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setSupportOpen(true)}
          >
            <Heart className="h-4 w-4 text-destructive" />
            {t("support_author")}
          </Button>
          <img
            src={supportQr}
            alt="Support QR"
            className="w-20 h-20 rounded cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setSupportOpen(true)}
          />
          <Button
            className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-md transition-all gap-2"
            onClick={() => window.open('https://ko-fi.com/linkora', '_blank')}
          >
            <Heart className="h-4 w-4 fill-current" />
            {t("support_project")}
          </Button>
        </div>

        {/* Author Apps */}
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{t("promo_author_apps")}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">{t("promo_rotates_on_start")}</p>
            </div>
          </div>

          <div className="space-y-3">
            {visiblePromotions.map((promotion) => (
              (() => {
                const title = t(promotion.titleKey);
                const description = t(promotion.descriptionKey);
                const details = t(promotion.detailsKey);

                return (
              <article
                key={promotion.id}
                className="rounded-lg border bg-background/80 p-3 shadow-sm transition-colors hover:bg-background"
              >
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-sm font-bold",
                      promotion.accent
                    )}
                  >
                    {title.slice(0, 1)}
                  </div>
                  <div
                    className="group/info relative min-w-0 cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    tabIndex={0}
                    aria-label={`${title}. ${details}`}
                  >
                    <h3 className="truncate text-sm font-semibold leading-tight underline decoration-dotted underline-offset-4">
                      {title}
                    </h3>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">
                      {description}
                    </p>
                    <div className="pointer-events-none absolute right-full top-0 z-50 mr-3 hidden w-80 rounded-lg border bg-popover p-4 text-popover-foreground shadow-2xl group-hover/info:block group-focus/info:block">
                      <div className="mb-3 overflow-hidden rounded-md border bg-muted">
                        <img
                          src={promotion.screenshotUrl}
                          alt=""
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="mb-2 flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-xs font-bold",
                            promotion.accent
                          )}
                        >
                          {title.slice(0, 1)}
                        </div>
                        <h4 className="text-sm font-semibold leading-tight">{title}</h4>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {details}
                      </p>
                      <div className={cn(
                        "mt-3 grid gap-2 text-[11px] font-medium text-primary",
                        promotion.downloadUrl ? "grid-cols-2" : "grid-cols-1"
                      )}>
                        <span>GitHub</span>
                        {promotion.downloadUrl && <span>{t("promo_download")}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={cn(
                  "mt-3 grid gap-2",
                  promotion.downloadUrl ? "grid-cols-2" : "grid-cols-1"
                )}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs"
                    onClick={() => openExternal(promotion.repoUrl)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    GitHub
                  </Button>
                  {promotion.downloadUrl && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 px-2 text-xs"
                      onClick={() => openExternal(promotion.downloadUrl)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("promo_download")}
                    </Button>
                  )}
                </div>
              </article>
                );
              })()
            ))}
          </div>
        </div>
      </aside>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
