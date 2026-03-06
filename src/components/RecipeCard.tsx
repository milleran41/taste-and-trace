import { Link } from "react-router-dom";
import { Recipe } from "@/types/recipe";

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const screenshots = Array.isArray(recipe.screenshots) ? recipe.screenshots : [];
  const mainImage = recipe.image || (screenshots.length > 0 ? String(screenshots[0]) : null);

  return (
    <Link to={`/recipe/${recipe.id}`} className="group">
      <div className="overflow-hidden rounded-lg bg-muted aspect-square">
        {mainImage ? (
          <img
            src={mainImage}
            alt={recipe.title}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <span className="text-5xl">🍽️</span>
          </div>
        )}
      </div>
      <h3 className="mt-2 text-sm font-medium text-foreground text-center line-clamp-2 group-hover:text-primary transition-colors">
        {recipe.title}
      </h3>
    </Link>
  );
}