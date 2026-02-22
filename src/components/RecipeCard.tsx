import { Link } from "react-router-dom";
import { Heart, Clock, Users } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Recipe } from "@/types/recipe";
import { useToggleFavorite } from "@/hooks/useRecipes";
import { cn } from "@/lib/utils";

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const toggleFavorite = useToggleFavorite();

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite.mutate({ id: recipe.id, isFavorite: !recipe.is_favorite });
  };

  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];

  return (
    <Link to={`/recipe/${recipe.id}`}>
      <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {(() => {
            const screenshots = Array.isArray(recipe.screenshots) ? recipe.screenshots : [];
            const mainImage = recipe.image || (screenshots.length > 0 ? String(screenshots[0]) : null);
            if (mainImage) {
              return (
                <img
                  src={mainImage}
                  alt={recipe.title}
                  className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                />
              );
            }
            return (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <span className="text-4xl">🍽️</span>
              </div>
            );
          })()}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute top-2 right-2 bg-background/80 backdrop-blur-sm hover:bg-background",
              recipe.is_favorite && "text-red-500"
            )}
            onClick={handleFavoriteClick}
          >
            <Heart className={cn("h-5 w-5", recipe.is_favorite && "fill-current")} />
          </Button>
          {recipe.difficulty && (
            <Badge variant="secondary" className="absolute top-2 left-2">
              {recipe.difficulty}
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          <h3 className="font-display text-lg font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {recipe.title}
          </h3>
          {recipe.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {recipe.description}
            </p>
          )}
        </CardContent>

        <CardFooter className="px-4 pb-4 pt-0 flex items-center gap-4 text-sm text-muted-foreground">
          {recipe.cooking_time && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{recipe.cooking_time}</span>
            </div>
          )}
          {recipe.servings && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{recipe.servings}</span>
            </div>
          )}
        </CardFooter>

        {tags.length > 0 && (
          <div className="px-4 pb-4 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {String(tag)}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
