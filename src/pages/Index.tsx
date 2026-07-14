import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { CategoryFilter } from "@/components/CategoryFilter";
import { RecipeGrid } from "@/components/RecipeGrid";
import { DndRecipeGrid } from "@/components/DndRecipeGrid";
import { RightSidebar } from "@/components/RightSidebar";
import { useRecipes, useFavoriteRecipes } from "@/hooks/useRecipes";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Index() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showFavorites = searchParams.get("favorites") === "true";
  const showRecipes = searchParams.get("recipes") === "true";
  const { t } = useTranslation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: allRecipes, isLoading: isLoadingAll } = useRecipes(
    showFavorites ? undefined : selectedCategory !== "all" ? selectedCategory : undefined,
    showRecipes
  );
  const { data: favoriteRecipes, isLoading: isLoadingFavorites } = useFavoriteRecipes(showFavorites);

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
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <div className="flex flex-1">
        <main className="flex-1 min-w-0 px-4 md:px-6 lg:px-8 py-8">
        <section className="mb-10">
          {showFavorites ? (
            <>
              <div className="flex items-center gap-3 mb-2">
                <Button variant="ghost" size="icon" asChild className="shrink-0">
                  <Link to="/" aria-label={t("back")} title={t("back")}>
                    <ArrowLeft className="h-5 w-5" />
                  </Link>
                </Button>
                <h1 className="font-display text-3xl md:text-4xl font-bold">
                  {t("favorite_recipes")}
                </h1>
              </div>
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
              {!showRecipes && (
                <div className="relative z-10 mt-8 flex flex-wrap gap-3">
                  <Button onClick={() => setSearchParams({ recipes: "true" })}>
                    {t("all_recipes")}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/?favorites=true">{t("favorites")}</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/add">{t("add_recipe")}</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        {(showRecipes || showFavorites) && (
          <section className="space-y-4 mb-8">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
            {!showFavorites && (
              <CategoryFilter
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
              />
            )}
          </section>
        )}

        {(showRecipes || showFavorites) && (
          !showFavorites && selectedCategory !== "all" && !searchQuery.trim() ? (
            <DndRecipeGrid
              recipes={filteredRecipes}
              isLoading={isLoading}
              selectedCategory={selectedCategory}
            />
          ) : (
            <RecipeGrid recipes={filteredRecipes} isLoading={isLoading} />
          )
        )}
        </main>
        <RightSidebar />
      </div>
    </div>
  );
}
