import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heart } from "lucide-react";

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

export function SupportModal({ open, onClose }: SupportModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-destructive" />
            {t("support_author")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-muted-foreground leading-relaxed">
            {t("support_author_message")}
          </p>
          <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
            {t("support_coming_soon")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
