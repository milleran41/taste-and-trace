/**
 * Recipe Service — database operations for recipes.
 * Wraps Supabase queries; consumed by React Query hooks in useRecipes.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import { Recipe, RecipeFormData } from "@/types/recipe";

export async function fetchRecipes(category?: string): Promise<Recipe[]> {
  let query = supabase
    .from("recipes")
    .select("*")
    .order("display_order", { ascending: true });

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Recipe[];
}

export async function fetchRecipeById(id: string): Promise<Recipe> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Recipe;
}

export async function fetchFavoriteRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("is_favorite", true)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data as Recipe[];
}

export async function createRecipe(recipe: RecipeFormData) {
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      cooking_time: recipe.cooking_time,
      difficulty: recipe.difficulty,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      notes: recipe.notes,
      tags: recipe.tags,
      image: recipe.image,
      screenshots: (recipe as any).screenshots || [],
      source: (recipe as any).source || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateRecipe(id: string, recipe: Partial<RecipeFormData>) {
  let displayOrder: number | undefined;

  if (recipe.category) {
    const { data: current } = await supabase
      .from("recipes")
      .select("category")
      .eq("id", id)
      .single();

    if (current && current.category !== recipe.category) {
      const { data: maxData } = await supabase
        .from("recipes")
        .select("display_order")
        .eq("category", recipe.category)
        .order("display_order", { ascending: false })
        .limit(1);

      displayOrder =
        maxData && maxData.length > 0 ? maxData[0].display_order + 1 : 0;
    }
  }

  const updateData: Record<string, unknown> = {
    title: recipe.title,
    description: recipe.description,
    category: recipe.category,
    cooking_time: recipe.cooking_time || null,
    difficulty: recipe.difficulty || null,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    notes: recipe.notes,
    tags: recipe.tags,
    image: recipe.image,
  };

  if (displayOrder !== undefined) {
    updateData.display_order = displayOrder;
  }

  const { data, error } = await supabase
    .from("recipes")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteRecipe(id: string) {
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleFavorite(id: string, isFavorite: boolean) {
  const { error } = await supabase
    .from("recipes")
    .update({ is_favorite: isFavorite })
    .eq("id", id);
  if (error) throw error;
}

export async function swapRecipeOrder(
  recipeA: { id: string; display_order: number },
  recipeB: { id: string; display_order: number }
) {
  const { error: e1 } = await supabase
    .from("recipes")
    .update({ display_order: recipeB.display_order })
    .eq("id", recipeA.id);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("recipes")
    .update({ display_order: recipeA.display_order })
    .eq("id", recipeB.id);
  if (e2) throw e2;
}

export async function moveRecipeToCategory(recipeId: string, newCategory: string) {
  const { data: maxData } = await supabase
    .from("recipes")
    .select("display_order")
    .eq("category", newCategory)
    .order("display_order", { ascending: false })
    .limit(1);

  const newOrder =
    maxData && maxData.length > 0 ? maxData[0].display_order + 1 : 0;

  const { error } = await supabase
    .from("recipes")
    .update({ category: newCategory, display_order: newOrder })
    .eq("id", recipeId);

  if (error) throw error;
}
