import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Heart } from "lucide-react";
import supportQr from "@/assets/images/support-qr.png";

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
          <div className="flex justify-center">
            <img
              src={supportQr}
              alt="Support QR"
              className="w-[200px] h-[200px] rounded-lg border border-border"
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            {t("support_scan_qr")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
