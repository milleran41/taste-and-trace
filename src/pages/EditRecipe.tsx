import { useState, useEffect, lazy, Suspense } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecipe, useUpdateRecipe } from "@/hooks/useRecipes";
import { useCategories } from "@/hooks/useCategories";
import { useTranslation } from "react-i18next";

const RecipeParserDialog = lazy(() => import("@/components/RecipeParserDialog").then(m => ({ default: m.RecipeParserDialog })));

export default function EditRecipe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: recipe, isLoading } = useRecipe(id!);
  const updateRecipe = useUpdateRecipe();
  const { data: categories } = useCategories();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({ title: "", description: "", category: "", cooking_time: "", difficulty: "", servings: 4, ingredients: "", instructions: "", notes: "", tags: "", image: "" });

  const handleParsed = (data: {
    title: string; description: string; ingredients: string; instructions: string;
    cooking_time: string; servings: number; difficulty: string; tags: string; notes: string; image?: string;
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
  };

  useEffect(() => {
    if (recipe) {
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.join("\n") : "";
      const instructions = Array.isArray(recipe.instructions) ? recipe.instructions.join("\n") : "";
      const tags = Array.isArray(recipe.tags) ? recipe.tags.join(", ") : "";
      setFormData({ title: recipe.title, description: recipe.description || "", category: recipe.category, cooking_time: recipe.cooking_time || "", difficulty: recipe.difficulty || "", servings: recipe.servings || 4, ingredients, instructions, notes: recipe.notes || "", tags, image: recipe.image || "" });
    }
  }, [recipe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateRecipe.mutateAsync({ id: id!, recipe: { ...formData, ingredients: formData.ingredients.split("\n").filter(Boolean), instructions: formData.instructions.split("\n").filter(Boolean), tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean) } });
    navigate(`/recipe/${id}`);
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center">{t("loading")}</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <Button variant="ghost" asChild className="mb-6"><Link to={`/recipe/${id}`}><ArrowLeft className="h-4 w-4 mr-2" />{t("back")}</Link></Button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-bold">{t("edit_recipe")}</h1>
          <Suspense fallback={null}>
            <RecipeParserDialog onParsed={handleParsed} />
          </Suspense>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card><CardHeader><CardTitle>{t("basic_info")}</CardTitle></CardHeader><CardContent className="space-y-4">
            <div><Label>{t("title")} *</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required /></div>
            <div><Label>{t("description")}</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
            <div><Label>{t("image_url")}</Label><Input value={formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("category")} *</Label><Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>))}</SelectContent></Select></div>
              <div><Label>{t("difficulty")}</Label><Select value={formData.difficulty} onValueChange={(v) => setFormData({ ...formData, difficulty: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">{t("easy")}</SelectItem><SelectItem value="medium">{t("medium")}</SelectItem><SelectItem value="hard">{t("hard")}</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("time")}</Label><Input value={formData.cooking_time} onChange={(e) => setFormData({ ...formData, cooking_time: e.target.value })} /></div>
              <div><Label>{t("servings")}</Label><Input type="number" value={formData.servings} onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) || 1 })} /></div>
            </div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>{t("ingredients")} & {t("instructions")}</CardTitle></CardHeader><CardContent className="space-y-4">
            <div><Label>{t("ingredients_per_line")}</Label><Textarea value={formData.ingredients} onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })} rows={6} /></div>
            <div><Label>{t("instructions_per_line")}</Label><Textarea value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} rows={8} /></div>
            <div><Label>{t("notes")}</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
            <div><Label>{t("tags")}</Label><Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} /></div>
          </CardContent></Card>
          <Button type="submit" className="w-full" disabled={updateRecipe.isPending}>{updateRecipe.isPending ? t("saving") : t("save_changes")}</Button>
        </form>
      </div>
    </div>
  );
}
