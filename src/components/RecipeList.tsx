import { Link } from "react-router-dom";
import { ChefHat, ChevronRight, Clock, Users } from "lucide-react";
import { Recipe } from "@/types/recipe";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface RecipeListProps {
  recipes: Recipe[];
  isLoading?: boolean;
}

export function RecipeList({ recipes, isLoading }: RecipeListProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card px-4 py-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
        <p className="text-lg text-muted-foreground">{t("no_recipes_found")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("try_different_search")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 overflow-visible md:grid-cols-2 xl:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeListRow key={recipe.id} recipe={recipe} />
      ))}
    </div>
  );
}

function RecipeListRow({ recipe }: { recipe: Recipe }) {
  const { t } = useTranslation();
  const description = recipe.description?.trim();
  const tags = Array.isArray(recipe.tags) ? recipe.tags.slice(0, 3) : [];

  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="group relative grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">
          {recipe.title}
        </h3>
        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {recipe.cooking_time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {recipe.cooking_time}
            </span>
          )}
          {recipe.difficulty && (
            <span className="inline-flex items-center gap-1">
              <ChefHat className="h-3.5 w-3.5" />
              {t(recipe.difficulty, { defaultValue: recipe.difficulty })}
            </span>
          )}
          {recipe.servings ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {t("servings_count", { count: recipe.servings })}
            </span>
          ) : null}
          {tags.map((tag) => (
            <Badge key={String(tag)} variant="secondary" className="h-5 max-w-28 truncate rounded px-1.5 text-[11px] font-normal">
              {String(tag)}
            </Badge>
          ))}
        </div>
      </div>

      <ChevronRight className="hidden h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary sm:block" />

      {description && (
        <div className="pointer-events-none absolute left-3 right-3 top-[calc(100%-4px)] z-30 hidden rounded-md border bg-popover px-3 py-2 text-sm leading-relaxed text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">
          {description}
        </div>
      )}
    </Link>
  );
}
