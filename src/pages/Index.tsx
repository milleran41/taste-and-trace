import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { CategoryFilter } from "@/components/CategoryFilter";
import { RecipeGrid } from "@/components/RecipeGrid";
import { DndRecipeGrid } from "@/components/DndRecipeGrid";
import { useRecipes, useFavoriteRecipes } from "@/hooks/useRecipes";
import { useTranslation } from "react-i18next";

export default function Index() {
  const [searchParams] = useSearchParams();
  const showFavorites = searchParams.get("favorites") === "true";
  const { t } = useTranslation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: allRecipes, isLoading: isLoadingAll } = useRecipes(
    showFavorites ? undefined : selectedCategory !== "all" ? selectedCategory : undefined
  );
  const { data: favoriteRecipes, isLoading: isLoadingFavorites } = useFavoriteRecipes();

  const recipes = showFavorites ? favoriteRecipes : allRecipes;
  const isLoading = showFavorites ? isLoadingFavorites : isLoadingAll;

  const filteredRecipes = useMemo(() => {
    if (!recipes) return [];
    if (!searchQuery.trim()) return recipes;

    const query = searchQuery.toLowerCase();
    return recipes.filter(
      (recipe) =>
        recipe.title.toLowerCase().includes(query) ||
        recipe.description?.toLowerCase().includes(query) ||
        (Array.isArray(recipe.tags) &&
          recipe.tags.some((tag) => String(tag).toLowerCase().includes(query)))
    );
  }, [recipes, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <section className="mb-10">
          {showFavorites ? (
            <>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
                {t("favorite_recipes")}
              </h1>
              <p className="text-muted-foreground">
                {t("your_favorites_in_one_place")}
              </p>
            </>
          ) : (
            <div className="relative bg-gradient-to-br from-card via-card to-accent/20 rounded-2xl p-8 md:p-12 border border-border/50 shadow-sm overflow-hidden">
              <div className="absolute top-4 left-6 text-6xl md:text-8xl text-primary/10 font-serif leading-none select-none">
                «
              </div>
              <div className="absolute bottom-4 right-6 text-6xl md:text-8xl text-primary/10 font-serif leading-none select-none">
                »
              </div>
              <blockquote className="relative z-10">
                <p className="font-display text-xl md:text-2xl lg:text-3xl font-medium text-foreground leading-relaxed mb-4">
                  <span className="text-primary">{t("quote_text").split(",")[0]},</span>
                  <br className="hidden md:block" />
                  {t("quote_text").split(",").slice(1).join(",")}
                </p>
                <p className="font-body text-lg md:text-xl text-muted-foreground italic mb-6">
                  {t("quote_subtext")}
                </p>
                <footer className="flex items-center gap-3">
                  <div className="h-px flex-1 max-w-16 bg-primary/30"></div>
                  <cite className="font-display text-sm md:text-base text-foreground/80 not-italic font-semibold tracking-wide">
                    {t("quote_author")}
                  </cite>
                  <span className="text-muted-foreground text-sm">
                    {t("quote_role")}
                  </span>
                </footer>
              </blockquote>
            </div>
          )}
        </section>

        <section className="space-y-4 mb-8">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          {!showFavorites && (
            <CategoryFilter
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          )}
        </section>

        {!showFavorites && selectedCategory !== "all" && !searchQuery.trim() ? (
          <DndRecipeGrid
            recipes={filteredRecipes}
            isLoading={isLoading}
            selectedCategory={selectedCategory}
          />
        ) : (
          <RecipeGrid recipes={filteredRecipes} isLoading={isLoading} />
        )}
      </main>
    </div>
  );
}
