import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ingredientMeasures, measureLabels, type MeasureKey, type IngredientMeasure,
} from "@/data/kitchenMeasures";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface MeasuresModalProps {
  open: boolean;
  onClose: () => void;
}

function formatAmount(val: number): string {
  if (val === 0) return "—";
  if (val < 0.1) return "<0.1";
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

export function MeasuresModal({ open, onClose }: MeasuresModalProps) {
  const [grams, setGrams] = useState("");
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientMeasure>(ingredientMeasures[0]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const g = parseFloat(grams) || 0;

  const results: { label: string; value: string }[] = (
    Object.keys(measureLabels) as MeasureKey[]
  )
    .filter((k) => selectedIngredient[k] > 0)
    .map((k) => ({
      label: t(k as string),
      value: g > 0 ? formatAmount(g / selectedIngredient[k]) : "—",
    }));

  return (
    <div ref={overlayRef} className="fixed inset-0 z-40 flex items-start justify-center pt-20 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="relative w-full max-w-md mx-4 rounded-xl border bg-card text-card-foreground shadow-xl animate-scale-in p-5 max-h-[80vh] overflow-y-auto">
        <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>

        <h2 className="font-display text-xl font-bold mb-4">{t("measures_reference")}</h2>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {ingredientMeasures.map((ing) => (
            <button key={ing.id} onClick={() => setSelectedIngredient(ing)} className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors", selectedIngredient.id === ing.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-transparent hover:border-border")}>
              {t(ing.id)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Input type="number" min="0" placeholder={t("grams")} value={grams} onChange={(e) => setGrams(e.target.value)} className="w-32" />
          <span className="text-sm text-muted-foreground">g → {t(selectedIngredient.id)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {results.map((r) => (
            <div key={r.label} className="rounded-lg bg-muted p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{r.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{r.label}</div>
            </div>
          ))}
        </div>

        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{t("full_measures_table")}</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 pr-2">{t("product")}</th>
                  <th className="text-right py-1.5 px-1">{t("tablespoon")}</th>
                  <th className="text-right py-1.5 px-1">{t("teaspoon")}</th>
                  <th className="text-right py-1.5 px-1">{t("glass")}</th>
                  <th className="text-right py-1.5 pl-1">{t("pinch")}</th>
                </tr>
              </thead>
              <tbody>
                {ingredientMeasures.map((ing) => (
                  <tr key={ing.id} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-2 font-medium">{t(ing.id)}</td>
                    <td className="text-right py-1.5 px-1">{ing.tablespoon}g</td>
                    <td className="text-right py-1.5 px-1">{ing.teaspoon}g</td>
                    <td className="text-right py-1.5 px-1">{ing.glass}g</td>
                    <td className="text-right py-1.5 pl-1">{ing.pinch > 0 ? `${ing.pinch}g` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
