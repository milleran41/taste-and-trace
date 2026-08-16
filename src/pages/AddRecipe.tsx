import { useState, useRef, lazy, Suspense } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateRecipe } from "@/hooks/useRecipes";
import { useCategories } from "@/hooks/useCategories";
import { useTranslation } from "react-i18next";
import { fileToDataUrl } from "@/services/storageService";

const RecipeParserDialog = lazy(() => import("@/components/RecipeParserDialog").then(m => ({ default: m.RecipeParserDialog })));

export default function AddRecipe() {
  const navigate = useNavigate();
  const location = useLocation();
  const importedDraft = (location.state as any)?.importedRecipeDraft;
  const createRecipe = useCreateRecipe();
  const { data: categories } = useCategories();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    title: importedDraft?.title || "",
    description: importedDraft?.description || "",
    category: importedDraft?.category || "",
    cooking_time: importedDraft?.cooking_time || "",
    difficulty: importedDraft?.difficulty || "",
    servings: importedDraft?.servings || 4,
    ingredients: Array.isArray(importedDraft?.ingredients) ? importedDraft.ingredients.join("\n") : "",
    instructions: Array.isArray(importedDraft?.instructions) ? importedDraft.instructions.join("\n") : "",
    notes: importedDraft?.notes || "",
    tags: Array.isArray(importedDraft?.tags) ? importedDraft.tags.join(", ") : "",
    image: importedDraft?.image || "",
    source: importedDraft?.source || null,
  });

  const [pendingScreenshots, setPendingScreenshots] = useState<string[]>([]);

  const handleParsed = (data: {
    title: string; description: string; ingredients: string; instructions: string;
    cooking_time: string; servings: number; difficulty: string; tags: string; notes: string;
    image?: string; screenshotToAdd?: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      title: data.title || prev.title,
      description: data.description || prev.description,
      ingredients: data.ingredients || prev.ingredients,
      instructions: data.instructions || prev.instructions,
      cooking_time: data.cooking_time || prev.cooking_time,
      servings: data.servings || prev.servings,
      difficulty: data.difficulty || prev.difficulty,
      tags: data.tags || prev.tags,
      notes: data.notes || prev.notes,
      image: data.image || prev.image,
    }));
    if (data.screenshotToAdd) {
      setPendingScreenshots((prev) => [...prev, data.screenshotToAdd!]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category) {
      toast.error(t("please_select_category"));
      return;
    }
    await createRecipe.mutateAsync({
      ...formData,
      ingredients: formData.ingredients.split("\n").filter(Boolean),
      instructions: formData.instructions.split("\n").filter(Boolean),
      tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
      screenshots: pendingScreenshots.length > 0 ? pendingScreenshots : [],
      source: formData.source || null,
    } as any);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <Button variant="ghost" asChild className="mb-6">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />{t("back")}</Link>
        </Button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-bold">{t("new_recipe")}</h1>
          <Suspense fallback={null}>
            <RecipeParserDialog onParsed={handleParsed} />
          </Suspense>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("basic_info")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label htmlFor="title">{t("title")} *</Label><Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required /></div>
              <div><Label htmlFor="description">{t("description")}</Label><Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
              <div>
                <Label htmlFor="image">{t("screenshot")}</Label>
                <Input 
                  id="image" 
                  value={formData.image} 
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder={t("paste_image_link")}
                  onPaste={async (e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.indexOf("image") !== -1) {
                        e.preventDefault();
                        const file = items[i].getAsFile();
                        if (file) {
                          try {
                            const base64 = await fileToDataUrl(file);
                            setFormData((prev) => ({ ...prev, image: base64 }));
                            toast.success("Изображение вставлено");
                          } catch (err) {
                            toast.error("Ошибка при вставке изображения");
                          }
                        }
                        break;
                      }
                    }
                  }}
                />
              </div>
              {pendingScreenshots.length > 0 && (
                <div>
                  <Label>{t("screenshots_from_photo")} ({pendingScreenshots.length})</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pendingScreenshots.map((src, i) => (
                      <div key={i} className="relative">
                        <img src={src} alt={`${t("screenshot")} ${i + 1}`} className="h-20 w-20 object-cover rounded border" />
                        <button type="button" className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-xs" onClick={() => setPendingScreenshots((prev) => prev.filter((_, idx) => idx !== i))}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("category")} *</Label><Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger><SelectContent>{categories?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>))}</SelectContent></Select></div>
                <div><Label>{t("difficulty")}</Label><Select value={formData.difficulty} onValueChange={(v) => setFormData({ ...formData, difficulty: v })}><SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger><SelectContent><SelectItem value="easy">{t("easy")}</SelectItem><SelectItem value="medium">{t("medium")}</SelectItem><SelectItem value="hard">{t("hard")}</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label htmlFor="time">{t("time")}</Label><Input id="time" placeholder="30 min" value={formData.cooking_time} onChange={(e) => setFormData({ ...formData, cooking_time: e.target.value })} /></div>
                <div><Label htmlFor="servings">{t("servings")}</Label><Input id="servings" type="number" value={formData.servings} onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) || 1 })} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("ingredients")} & {t("instructions")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>{t("ingredients_per_line")}</Label><Textarea value={formData.ingredients} onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })} rows={6} /></div>
              <div><Label>{t("instructions_per_line")}</Label><Textarea value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} rows={8} /></div>
              <div><Label>{t("notes")}</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
              <div><Label>{t("tags")}</Label><Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} placeholder={t("tags_comma")} /></div>
            </CardContent>
          </Card>
          <Button type="submit" className="w-full" disabled={createRecipe.isPending}>{createRecipe.isPending ? t("saving") : t("save_recipe")}</Button>
        </form>
      </div>
    </div>
  );
}
