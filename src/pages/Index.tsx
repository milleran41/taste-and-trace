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
        <section className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            {showFavorites ? "Избранные рецепты" : "Все рецепты"}
          </h1>
          <p className="text-muted-foreground">
            {showFavorites ? "Ваши любимые рецепты в одном месте" : "Найдите идеальный рецепт для любого случая"}
          </p>
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
