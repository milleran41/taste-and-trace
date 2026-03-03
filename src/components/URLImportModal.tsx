import { useState, useRef, useEffect } from "react";
import { X, Link2, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";
import { useCreateRecipe } from "@/hooks/useRecipes";
import { useNavigate } from "react-router-dom";

type Stage = "idle" | "fetching" | "analyzing" | "formatting" | "done" | "error";

interface ParsedRecipe {
  title: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  cooking_time: string;
  servings: number;
  difficulty: string;
  tags: string[];
  notes: string;
  category_hint: string;
  source?: {
    sourceType: string;
    sourceUrl: string;
    sourcePlatform: string;
  };
  thumbnail?: string;
}

interface URLImportModalProps {
  open: boolean;
  onClose: () => void;
}

const STAGE_LABELS: Record<Stage, string> = {
  idle: "",
  fetching: "Получение текста…",
  analyzing: "Анализ содержимого…",
  formatting: "Формирование рецепта…",
  done: "Готово!",
  error: "Ошибка",
};

export function URLImportModal({ open, onClose }: URLImportModalProps) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    title: "",
    description: "",
    ingredients: "",
    instructions: "",
    cooking_time: "",
    servings: 4,
    difficulty: "",
    tags: "",
    notes: "",
    category: "",
  });

  const overlayRef = useRef<HTMLDivElement>(null);
  const { data: categories } = useCategories();
  const createRecipe = useCreateRecipe();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleImport = async () => {
    if (!url.trim()) return;

    setStage("fetching");
    setErrorMsg("");
    setParsed(null);

    try {
      // Simulate stages for UX
      setTimeout(() => setStage("analyzing"), 1500);
      setTimeout(() => setStage("formatting"), 4000);

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-recipe-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ url: url.trim() }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка: ${resp.status}`);
      }

      const data: ParsedRecipe = await resp.json();
      setParsed(data);
      setEditData({
        title: data.title || "",
        description: data.description || "",
        ingredients: (data.ingredients || []).join("\n"),
        instructions: (data.instructions || []).join("\n"),
        cooking_time: data.cooking_time || "",
        servings: data.servings || 4,
        difficulty: data.difficulty || "medium",
        tags: (data.tags || []).join(", "),
        notes: data.notes || "",
        category: "",
      });
      setStage("done");
    } catch (e) {
      setStage("error");
      setErrorMsg(e instanceof Error ? e.message : "Неизвестная ошибка");
    }
  };

  const handleSave = async () => {
    const data = editMode ? editData : {
      title: parsed!.title,
      description: parsed!.description,
      ingredients: (parsed!.ingredients || []).join("\n"),
      instructions: (parsed!.instructions || []).join("\n"),
      cooking_time: parsed!.cooking_time,
      servings: parsed!.servings,
      difficulty: parsed!.difficulty,
      tags: (parsed!.tags || []).join(", "),
      notes: parsed!.notes,
      category: editData.category,
    };

    if (!data.category) {
      toast.error("Выберите категорию");
      return;
    }

    try {
      const sourceData = editMode ? parsed?.source : parsed?.source;
      const thumbnailUrl = parsed?.thumbnail || "";

      await createRecipe.mutateAsync({
        title: data.title,
        description: data.description,
        ingredients: data.ingredients.split("\n").filter(Boolean),
        instructions: data.instructions.split("\n").filter(Boolean),
        cooking_time: data.cooking_time,
        servings: data.servings,
        difficulty: data.difficulty,
        tags: data.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: data.notes,
        category: data.category,
        image: thumbnailUrl,
        source: sourceData || null,
      } as any);
      onClose();
      navigate("/");
    } catch {
      toast.error("Ошибка при сохранении рецепта");
    }
  };

  const reset = () => {
    setUrl("");
    setStage("idle");
    setParsed(null);
    setEditMode(false);
    setErrorMsg("");
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl mx-4 rounded-xl border bg-card text-card-foreground shadow-xl animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Импорт рецепта</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* URL Input */}
          {stage === "idle" || stage === "error" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Вставьте ссылку на рецепт из кулинарного сайта, блога, YouTube или TikTok
              </p>
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                <Button onClick={handleImport} disabled={!url.trim()}>
                  Обработать
                </Button>
              </div>
              {stage === "error" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Loading stages */}
          {(stage === "fetching" || stage === "analyzing" || stage === "formatting") && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="space-y-2 text-center">
                {(["fetching", "analyzing", "formatting"] as Stage[]).map((s) => (
                  <div
                    key={s}
                    className={`text-sm flex items-center gap-2 justify-center transition-opacity ${
                      stage === s
                        ? "text-foreground font-medium"
                        : (["fetching", "analyzing", "formatting"].indexOf(stage) >
                          ["fetching", "analyzing", "formatting"].indexOf(s))
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {["fetching", "analyzing", "formatting"].indexOf(stage) >
                    ["fetching", "analyzing", "formatting"].indexOf(s) ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : stage === s ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <div className="h-3.5 w-3.5" />
                    )}
                    {STAGE_LABELS[s]}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview / Edit */}
          {stage === "done" && parsed && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>Рецепт создан автоматически. Проверьте ингредиенты и шаги.</span>
              </div>

              {!editMode ? (
                /* Preview mode */
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{parsed.title}</CardTitle>
                    {parsed.description && (
                      <p className="text-sm text-muted-foreground">{parsed.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {parsed.thumbnail && (
                      <div className="aspect-video overflow-hidden rounded-lg">
                        <img src={parsed.thumbnail} alt={parsed.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {parsed.cooking_time && <Badge variant="outline">⏱ {parsed.cooking_time}</Badge>}
                      {parsed.servings && <Badge variant="outline">👥 {parsed.servings} порций</Badge>}
                      {parsed.difficulty && <Badge variant="outline">{parsed.difficulty}</Badge>}
                    </div>

                    {parsed.ingredients?.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1.5 text-sm">Ингредиенты</h4>
                        <ul className="text-sm space-y-1">
                          {parsed.ingredients.map((ing, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-primary flex-shrink-0" />
                              {ing}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {parsed.instructions?.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1.5 text-sm">Приготовление</h4>
                        <ol className="text-sm space-y-1.5">
                          {parsed.instructions.map((step, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-primary font-medium">{i + 1}.</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {parsed.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {parsed.tags.map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {parsed.notes && (
                      <p className="text-xs text-muted-foreground italic">{parsed.notes}</p>
                    )}

                    {parsed.source?.sourceUrl && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                        <Link2 className="h-3.5 w-3.5" />
                        <span>Источник:</span>
                        <a
                          href={parsed.source.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline truncate max-w-[300px]"
                        >
                          {parsed.source.sourcePlatform === "youtube" ? "YouTube" :
                           parsed.source.sourcePlatform === "tiktok" ? "TikTok" :
                           new URL(parsed.source.sourceUrl).hostname}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                /* Edit mode */
                <div className="space-y-3">
                  <div>
                    <Label>Название</Label>
                    <Input
                      value={editData.title}
                      onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Описание</Label>
                    <Textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>Ингредиенты (каждый с новой строки)</Label>
                    <Textarea
                      value={editData.ingredients}
                      onChange={(e) => setEditData({ ...editData, ingredients: e.target.value })}
                      rows={5}
                    />
                  </div>
                  <div>
                    <Label>Инструкции (каждый шаг с новой строки)</Label>
                    <Textarea
                      value={editData.instructions}
                      onChange={(e) => setEditData({ ...editData, instructions: e.target.value })}
                      rows={5}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Время</Label>
                      <Input
                        value={editData.cooking_time}
                        onChange={(e) => setEditData({ ...editData, cooking_time: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Порции</Label>
                      <Input
                        type="number"
                        value={editData.servings}
                        onChange={(e) =>
                          setEditData({ ...editData, servings: parseInt(e.target.value) || 1 })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Сложность</Label>
                    <Select
                      value={editData.difficulty}
                      onValueChange={(v) => setEditData({ ...editData, difficulty: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Легко</SelectItem>
                        <SelectItem value="medium">Средне</SelectItem>
                        <SelectItem value="hard">Сложно</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Теги (через запятую)</Label>
                    <Input
                      value={editData.tags}
                      onChange={(e) => setEditData({ ...editData, tags: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Заметки</Label>
                    <Textarea
                      value={editData.notes}
                      onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Category selector (always visible) */}
              <div>
                <Label>Категория *</Label>
                <Select
                  value={editData.category}
                  onValueChange={(v) => setEditData({ ...editData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {parsed.category_hint && (
                  <p className="text-xs text-muted-foreground mt-1">
                    AI подсказка: {parsed.category_hint}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2 justify-end">
          {stage === "done" && parsed && (
            <>
              <Button variant="outline" onClick={reset}>
                Отменить
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? "Предпросмотр" : "Редактировать"}
              </Button>
              <Button onClick={handleSave} disabled={createRecipe.isPending}>
                {createRecipe.isPending ? "Сохранение..." : "Сохранить"}
              </Button>
            </>
          )}
          {stage === "error" && (
            <Button variant="outline" onClick={reset}>
              Попробовать снова
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
