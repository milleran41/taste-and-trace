import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
import { RecipeParserDialog } from "@/components/RecipeParserDialog";

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

  // Screenshots pending to be saved with the recipe
  const [pendingScreenshots, setPendingScreenshots] = useState<string[]>([]);

  const handleParsed = (data: {
    title: string;
    description: string;
    ingredients: string;
    instructions: string;
    cooking_time: string;
    servings: number;
    difficulty: string;
    tags: string;
    notes: string;
    image?: string;
    screenshotToAdd?: string;
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
      toast.error("Пожалуйста, выберите категорию");
      return;
    }
    await createRecipe.mutateAsync({
      ...formData,
      ingredients: formData.ingredients.split("\n").filter(Boolean),
      instructions: formData.instructions.split("\n").filter(Boolean),
      tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
      screenshots: pendingScreenshots.length > 0 ? pendingScreenshots : [],
    } as any);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <Button variant="ghost" asChild className="mb-6">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Назад</Link>
        </Button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-bold">Новый рецепт</h1>
          <RecipeParserDialog onParsed={handleParsed} />
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Основная информация</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label htmlFor="title">Название *</Label><Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required /></div>
              <div><Label htmlFor="description">Описание</Label><Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
              <div><Label htmlFor="image">URL изображения</Label><Input id="image" value={formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} /></div>
              {pendingScreenshots.length > 0 && (
                <div>
                  <Label>Скриншоты из фото ({pendingScreenshots.length})</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pendingScreenshots.map((src, i) => (
                      <div key={i} className="relative">
                        <img src={src} alt={`Screenshot ${i + 1}`} className="h-20 w-20 object-cover rounded border" />
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-xs"
                          onClick={() => setPendingScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Категория *</Label><Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger><SelectContent>{categories?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>))}</SelectContent></Select></div>
                <div><Label>Сложность</Label><Select value={formData.difficulty} onValueChange={(v) => setFormData({ ...formData, difficulty: v })}><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger><SelectContent><SelectItem value="easy">Легко</SelectItem><SelectItem value="medium">Средне</SelectItem><SelectItem value="hard">Сложно</SelectItem></SelectContent></Select></div>
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
