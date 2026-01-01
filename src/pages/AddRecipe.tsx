import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateRecipe } from "@/hooks/useRecipes";
import { useCategories } from "@/hooks/useCategories";

export default function AddRecipe() {
  const navigate = useNavigate();
  const createRecipe = useCreateRecipe();
  const { data: categories } = useCategories();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    cooking_time: "",
    difficulty: "",
    servings: 4,
    ingredients: "",
    instructions: "",
    notes: "",
    tags: "",
    image: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRecipe.mutateAsync({
      ...formData,
      ingredients: formData.ingredients.split("\n").filter(Boolean),
      instructions: formData.instructions.split("\n").filter(Boolean),
      tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <Button variant="ghost" asChild className="mb-6">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Назад</Link>
        </Button>
        <h1 className="font-display text-3xl font-bold mb-6">Новый рецепт</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Основная информация</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label htmlFor="title">Название *</Label><Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required /></div>
              <div><Label htmlFor="description">Описание</Label><Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
              <div><Label htmlFor="image">URL изображения</Label><Input id="image" value={formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Категория *</Label><Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger><SelectContent>{categories?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>))}</SelectContent></Select></div>
                <div><Label>Сложность</Label><Select value={formData.difficulty} onValueChange={(v) => setFormData({ ...formData, difficulty: v })}><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger><SelectContent><SelectItem value="Легко">Легко</SelectItem><SelectItem value="Средне">Средне</SelectItem><SelectItem value="Сложно">Сложно</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label htmlFor="time">Время</Label><Input id="time" placeholder="30 минут" value={formData.cooking_time} onChange={(e) => setFormData({ ...formData, cooking_time: e.target.value })} /></div>
                <div><Label htmlFor="servings">Порции</Label><Input id="servings" type="number" value={formData.servings} onChange={(e) => setFormData({ ...formData, servings: parseInt(e.target.value) || 1 })} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Ингредиенты и инструкции</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Ингредиенты (каждый с новой строки)</Label><Textarea value={formData.ingredients} onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })} rows={6} /></div>
              <div><Label>Инструкции (каждый шаг с новой строки)</Label><Textarea value={formData.instructions} onChange={(e) => setFormData({ ...formData, instructions: e.target.value })} rows={8} /></div>
              <div><Label>Заметки</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
              <div><Label>Теги (через запятую)</Label><Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} placeholder="завтрак, быстро, здоровое" /></div>
            </CardContent>
          </Card>
          <Button type="submit" className="w-full" disabled={createRecipe.isPending}>{createRecipe.isPending ? "Сохранение..." : "Сохранить рецепт"}</Button>
        </form>
      </div>
    </div>
  );
}
