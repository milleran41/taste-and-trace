import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Clock, Users, Heart, Edit, Trash2, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRecipe, useDeleteRecipe, useToggleFavorite } from "@/hooks/useRecipes";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: recipe, isLoading } = useRecipe(id!);
  const { data: categories } = useCategories();
  const deleteRecipe = useDeleteRecipe();
  const toggleFavorite = useToggleFavorite();

  const categoryLabel = categories?.find((c) => c.id === recipe?.category)?.label;

  const handleDelete = async () => {
    if (!id) return;
    await deleteRecipe.mutateAsync(id);
    navigate("/");
  };

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, isFavorite: !recipe.is_favorite });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="aspect-video w-full max-w-3xl rounded-xl mb-8" />
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">Рецепт не найден</h1>
          <Button asChild>
            <Link to="/">Вернуться на главную</Link>
          </Button>
        </div>
      </div>
    );
  }

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  const screenshots = Array.isArray(recipe.screenshots) ? recipe.screenshots.map(String) : [];
  const mainImage = recipe.image || (screenshots.length > 0 ? screenshots[0] : null);

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleFavorite}
              className={cn(recipe.is_favorite && "text-red-500")}
            >
              <Heart className={cn("h-5 w-5", recipe.is_favorite && "fill-current")} />
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/edit/${recipe.id}`}>
                <Edit className="h-4 w-4 mr-2" />
                Редактировать
              </Link>
            </Button>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Удалить рецепт?</DialogTitle>
                  <DialogDescription>
                    Это действие нельзя отменить. Рецепт будет удалён навсегда.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                    Отмена
                  </Button>
                  <Button variant="destructive" onClick={handleDelete}>
                    Удалить
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {mainImage ? (
              <div className="aspect-video overflow-hidden rounded-xl">
                <img
                  src={mainImage}
                  alt={recipe.title}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-xl bg-muted flex items-center justify-center">
                <ChefHat className="h-16 w-16 text-muted-foreground" />
              </div>
            )}

            {screenshots.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {screenshots.slice(1).map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Скриншот ${i + 2}`}
                    className="h-24 w-24 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => window.open(src, '_blank')}
                  />
                ))}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                {categoryLabel && <Badge variant="secondary">{categoryLabel}</Badge>}
                {recipe.difficulty && <Badge variant="outline">{recipe.difficulty}</Badge>}
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
                {recipe.title}
              </h1>
              {recipe.description && (
                <p className="text-lg text-muted-foreground">{recipe.description}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-muted-foreground">
              {recipe.cooking_time && (
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <span>{recipe.cooking_time}</span>
                </div>
              )}
              {recipe.servings && (
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <span>{recipe.servings} порций</span>
                </div>
              )}
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <Badge key={index} variant="outline">
                    {String(tag)}
                  </Badge>
                ))}
              </div>
            )}

            {instructions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Приготовление</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-4">
                    {instructions.map((step, index) => (
                      <li key={index} className="flex gap-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </span>
                        <p className="pt-1">{String(step)}</p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}

            {recipe.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Заметки</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{recipe.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            {ingredients.length > 0 && (
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Ингредиенты</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {ingredients.map((ingredient, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="w-2 h-2 mt-2 rounded-full bg-primary flex-shrink-0" />
                        <span>{String(ingredient)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
