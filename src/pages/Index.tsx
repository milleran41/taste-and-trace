import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { CategoryFilter } from "@/components/CategoryFilter";
import { RecipeGrid } from "@/components/RecipeGrid";
import { RecipeList } from "@/components/RecipeList";
import { DndRecipeGrid } from "@/components/DndRecipeGrid";
import { RightSidebar } from "@/components/RightSidebar";
import { HomePage } from "@/components/HomePage";
import { useRecipes, useFavoriteRecipes } from "@/hooks/useRecipes";
import { useTranslation } from "react-i18next";
import cookingSilhouettesBanner from "@/assets/images/cooking-silhouettes-banner.jpeg";
import { Button } from "@/components/ui/button";
import { Grip, List } from "lucide-react";

export default function Index() {
  const [searchParams] = useSearchParams();
  const showFavorites = searchParams.get("favorites") === "true";
  const { t } = useTranslation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categoryView, setCategoryView] = useState<"list" | "cards">("list");
  const isHome = !showFavorites && selectedCategory === "all";

  useEffect(() => {
    setCategoryView("list");
  }, [selectedCategory]);

  const { data: allRecipes, isLoading: isLoadingAll } = useRecipes(
    selectedCategory !== "all" ? selectedCategory : undefined,
    !showFavorites && selectedCategory !== "all"
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
        {!isHome && (
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
            <div className="relative min-h-[240px] bg-gradient-to-br from-card via-[#fffaf5] to-[#edf7df] rounded-2xl p-8 md:p-12 border border-border/50 shadow-sm overflow-hidden">
              <div className="absolute inset-y-0 right-0 w-[58%] bg-gradient-to-l from-[#edf7df]/90 via-[#fff5e8]/55 to-transparent" />
              <img
                src={cookingSilhouettesBanner}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute bottom-5 right-8 hidden h-[58%] w-[48%] max-w-[720px] object-contain object-bottom opacity-80 mix-blend-multiply lg:block"
              />
              <div className="absolute top-4 left-6 text-6xl md:text-8xl text-primary/10 font-serif leading-none select-none">
                «
              </div>
              <div className="absolute bottom-4 right-6 text-6xl md:text-8xl text-primary/10 font-serif leading-none select-none">
                »
              </div>
              <blockquote className="relative z-10 max-w-[58rem] lg:max-w-[54%]">
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
        )}

        <section className="space-y-4 mb-8">
          {!isHome && (
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex-1">
                <SearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>
              {!showFavorites && selectedCategory !== "all" && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant={categoryView === "list" ? "default" : "outline"}
                    size="icon"
                    className="h-10 w-10"
                    title={t("list_view", { defaultValue: "List view" })}
                    onClick={() => setCategoryView("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={categoryView === "cards" ? "default" : "outline"}
                    size="icon"
                    className="h-10 w-10"
                    title={t("reorder_view", { defaultValue: "Cards and sorting" })}
                    onClick={() => setCategoryView("cards")}
                  >
                    <Grip className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
          {!showFavorites && (
            <CategoryFilter
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          )}
        </section>

        {isHome ? (
          <HomePage />
        ) : !showFavorites && selectedCategory !== "all" && categoryView === "list" ? (
          <RecipeList
            recipes={filteredRecipes}
            isLoading={isLoading}
          />
        ) : !showFavorites && selectedCategory !== "all" ? (
          <DndRecipeGrid
            recipes={filteredRecipes}
            isLoading={isLoading}
            selectedCategory={selectedCategory}
          />
        ) : (
          <RecipeGrid recipes={filteredRecipes} isLoading={isLoading} />
        )}
        </main>
        <RightSidebar />
      </div>
    </div>
  );
}
