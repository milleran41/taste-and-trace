import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportModal } from "@/components/SupportModal";

export function RightSidebar() {
  const [supportOpen, setSupportOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col gap-4 p-4 border-l border-border bg-card/50">
        {/* Support Author */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setSupportOpen(true)}
          >
            <Heart className="h-4 w-4 text-destructive" />
            {t("support_author")}
          </Button>
        </div>

        {/* Ad Placeholder */}
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
          <Megaphone className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground/60">{t("ad_placeholder")}</p>
        </div>
      </aside>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
