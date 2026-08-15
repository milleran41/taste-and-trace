import { Link } from "react-router-dom";
import { Recipe } from "@/types/recipe";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useRecipeCardImage } from "@/hooks/useRecipes";

interface PuzzleRecipeTileProps {
  recipe: Recipe;
  index?: number;
  className?: string;
}

export function PuzzleRecipeTile({ recipe, index = 0, className }: PuzzleRecipeTileProps) {
  const title = String(recipe.title || "");
  const tileRef = useRef<HTMLAnchorElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const [shouldLoadImage, setShouldLoadImage] = useState(Boolean(recipe.image || recipe.screenshots));

  useEffect(() => {
    setImageError(false);
    setShouldLoadImage(Boolean(recipe.image || recipe.screenshots));
  }, [recipe.id, recipe.image, recipe.screenshots]);

  useEffect(() => {
    if (shouldLoadImage || !tileRef.current) return;

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

    observer.observe(tileRef.current);
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

  return (
    <Link
      ref={tileRef}
      to={`/recipe/${recipe.id}`}
      title={title}
      aria-label={title}
      className={cn(
        "group/tile relative block h-32 min-w-0 overflow-visible rounded-lg border bg-card text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
    >
      <span className="absolute inset-0 overflow-hidden rounded-lg">
        {mainImage && !imageError ? (
          <img
            src={mainImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover/tile:scale-105"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,hsl(var(--accent)/.55),transparent_36%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--secondary)))] text-4xl">
            🍽️
          </span>
        )}
      </span>
      <span className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/78 via-black/24 to-black/8" />
      <span className="absolute inset-[1px] rounded-[7px] border border-white/18" />

      <span className="relative z-10 flex h-full items-end justify-center px-3 pb-3 text-center">
        <span className="line-clamp-2 text-sm font-semibold leading-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          {title}
        </span>
      </span>

      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-56 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs leading-4 text-popover-foreground shadow-lg group-hover/tile:block group-focus-visible/tile:block">
        {title}
      </span>
    </Link>
  );
}
