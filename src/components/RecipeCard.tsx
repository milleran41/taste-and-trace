import { Link } from "react-router-dom";
import { Recipe } from "@/types/recipe";
import { useEffect, useRef, useState } from "react";
import { useRecipeCardImage } from "@/hooks/useRecipes";

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const [imageError, setImageError] = useState(false);
  const [shouldLoadImage, setShouldLoadImage] = useState(Boolean(recipe.image || recipe.screenshots));
  const cardRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (shouldLoadImage || !cardRef.current) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoadImage(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadImage(true);
          observer.disconnect();
        }
      },
      { rootMargin: "500px" }
    );

    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [shouldLoadImage]);

  const { data: imageData } = useRecipeCardImage(
    recipe.id,
    shouldLoadImage && !recipe.image && !recipe.screenshots
  );

  const screenshots = Array.isArray(recipe.screenshots)
    ? recipe.screenshots
    : Array.isArray(imageData?.screenshots)
      ? imageData.screenshots
      : [];
  const mainImage = recipe.image || imageData?.image || (screenshots.length > 0 ? String(screenshots[0]) : null);
  
  // Определяем итоговый URL изображения с учётом ошибок загрузки
  const imageUrl = imageError ? "/placeholder-recipe.jpg" : (mainImage || "");
  const hasImage = imageUrl || mainImage; // mainImage нужен, чтобы знать, рендерить ли <img> или заглушку

  return (
    <Link ref={cardRef} to={`/recipe/${recipe.id}`} className="group">
      <div className="overflow-hidden rounded-lg bg-muted aspect-square">
        {hasImage && !imageError ? (
          <img
            src={imageUrl || "/placeholder-recipe.jpg"}
            alt={recipe.title}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/50">
            <span className="text-5xl select-none">🍽️</span>
          </div>
        )}
      </div>
      <h3 className="mt-2 text-sm font-medium text-foreground text-center line-clamp-2 group-hover:text-primary transition-colors">
        {recipe.title}
      </h3>
    </Link>
  );
}
