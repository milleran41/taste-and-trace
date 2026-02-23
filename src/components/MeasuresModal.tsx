import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ingredientMeasures,
  measureLabels,
  type MeasureKey,
  type IngredientMeasure,
} from "@/data/kitchenMeasures";
import { cn } from "@/lib/utils";

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
  const [selectedIngredient, setSelectedIngredient] =
    useState<IngredientMeasure>(ingredientMeasures[0]);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
      label: measureLabels[k],
      value: g > 0 ? formatAmount(g / selectedIngredient[k]) : "—",
    }));

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-40 flex items-start justify-center pt-20 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative w-full max-w-md mx-4 rounded-xl border bg-card text-card-foreground shadow-xl animate-scale-in p-5 max-h-[80vh] overflow-y-auto">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        <h2 className="font-display text-xl font-bold mb-4">
          Справочник мер
        </h2>

        {/* Ingredient selector */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ingredientMeasures.map((ing) => (
            <button
              key={ing.name}
              onClick={() => setSelectedIngredient(ing)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                selectedIngredient.name === ing.name
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-transparent hover:border-border"
              )}
            >
              {ing.name}
            </button>
          ))}
        </div>

        {/* Gram input */}
        <div className="flex items-center gap-3 mb-4">
          <Input
            type="number"
            min="0"
            placeholder="Граммы"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">
            г → {selectedIngredient.name}
          </span>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {results.map((r) => (
            <div
              key={r.label}
              className="rounded-lg bg-muted p-3 text-center"
            >
              <div className="text-2xl font-bold text-foreground">
                {r.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {r.label}
              </div>
            </div>
          ))}
        </div>

        {/* Reference table */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Полная таблица мер
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 pr-2">Продукт</th>
                  <th className="text-right py-1.5 px-1">Ст.л.</th>
                  <th className="text-right py-1.5 px-1">Ч.л.</th>
                  <th className="text-right py-1.5 px-1">Стакан</th>
                  <th className="text-right py-1.5 pl-1">Щепотка</th>
                </tr>
              </thead>
              <tbody>
                {ingredientMeasures.map((ing) => (
                  <tr
                    key={ing.name}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-1.5 pr-2 font-medium">{ing.name}</td>
                    <td className="text-right py-1.5 px-1">
                      {ing.tablespoon}г
                    </td>
                    <td className="text-right py-1.5 px-1">
                      {ing.teaspoon}г
                    </td>
                    <td className="text-right py-1.5 px-1">{ing.glass}г</td>
                    <td className="text-right py-1.5 pl-1">
                      {ing.pinch > 0 ? `${ing.pinch}г` : "—"}
                    </td>
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
