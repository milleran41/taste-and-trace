import { useState, useEffect } from "react";
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

export default function EditRecipe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: recipe, isLoading } = useRecipe(id!);
  const updateRecipe = useUpdateRecipe();
  const { data: categories } = useCategories();

  const [formData, setFormData] = useState({ title: "", description: "", category: "", cooking_time: "", difficulty: "", servings: 4, ingredients: "", instructions: "", notes: "", tags: "", image: "" });

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

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center">Загрузка...</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <Button variant="ghost" asChild className="mb-6"><Link to={`/recipe/${id}`}><ArrowLeft className="h-4 w-4 mr-2" />Назад</Link></Button>
        <h1 className="font-display text-3xl font-bold mb-6">Редактировать рецепт</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card><CardHeader><CardTitle>Основная информация</CardTitle></CardHeader><CardContent className="space-y-4">
            <div><Label>Название *</Label><Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required /></div>
            <div><Label>Описание</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
            <div><Label>URL изображения</Label><Input value={formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Категория *</Label><Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>))}</SelectContent></Select></div>
              <div><Label>Сложность</Label><Select value={formData.difficulty} onValueChange={(v) => setFormData({ ...formData, difficulty: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Легко">Легко</SelectItem><SelectItem value="Средне">Средне</SelectItem><SelectItem value="Сложно">Сложно</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Время</Label><Input value={formData.cooking_time} onChange={(e) => setFormData({ ...formData, cooking_time: e.target.value })} /></div>
              <div><Label>Порции</Label><Input type="number" value={formData.servings} onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) || 1 })} /></div>
            </div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Ингредиенты и инструкции</CardTitle></CardHeader><CardContent className="space-y-4">
            <div><Label>Ингредиенты</Label><Textarea value={formData.ingredients} onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })} rows={6} /></div>
            <div><Label>Инструкции</Label><Textarea value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} rows={8} /></div>
            <div><Label>Заметки</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
            <div><Label>Теги</Label><Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} /></div>
          </CardContent></Card>
          <Button type="submit" className="w-full" disabled={updateRecipe.isPending}>{updateRecipe.isPending ? "Сохранение..." : "Сохранить изменения"}</Button>
        </form>
      </div>
    </div>
  );
}
