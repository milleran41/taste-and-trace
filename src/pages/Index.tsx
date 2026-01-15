import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { CategoryFilter } from "@/components/CategoryFilter";
import { RecipeGrid } from "@/components/RecipeGrid";
import { useRecipes, useFavoriteRecipes } from "@/hooks/useRecipes";

export default function Index() {
  const [searchParams] = useSearchParams();
  const showFavorites = searchParams.get("favorites") === "true";
  
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
                Избранные рецепты
              </h1>
              <p className="text-muted-foreground">
                Ваши любимые рецепты в одном месте
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
                  <span className="text-primary">Вы должны любить</span> то, что едите, 
                  <br className="hidden md:block" />
                  или любить человека, которому готовите.
                </p>
                <p className="font-body text-lg md:text-xl text-muted-foreground italic mb-6">
                  Приготовление еды – это акт любви.
                </p>
                <footer className="flex items-center gap-3">
                  <div className="h-px flex-1 max-w-16 bg-primary/30"></div>
                  <cite className="font-display text-sm md:text-base text-foreground/80 not-italic font-semibold tracking-wide">
                    Ален Шапель
                  </cite>
                  <span className="text-muted-foreground text-sm">
                    шеф-повар
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

        <RecipeGrid recipes={filteredRecipes} isLoading={isLoading} />
      </main>
    </div>
  );
}
