import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Recipe, RecipeFormData } from "@/types/recipe";
import { toast } from "sonner";

export function useRecipes(category?: string) {
  return useQuery({
    queryKey: ["recipes", category],
    queryFn: async () => {
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
    },
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ["recipe", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Recipe;
    },
    enabled: !!id,
  });
}

export function useFavoriteRecipes() {
  return useQuery({
    queryKey: ["recipes", "favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .eq("is_favorite", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as Recipe[];
    },
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipe: RecipeFormData) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Рецепт успешно создан!");
    },
    onError: () => {
      toast.error("Ошибка при создании рецепта");
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, recipe }: { id: string; recipe: Partial<RecipeFormData> }) => {
      // If category changed, compute new display_order for the target category
      let displayOrder: number | undefined;
      if (recipe.category) {
        const { data: current } = await supabase.from("recipes").select("category").eq("id", id).single();
        if (current && current.category !== recipe.category) {
          const { data: maxData } = await supabase
            .from("recipes")
            .select("display_order")
            .eq("category", recipe.category)
            .order("display_order", { ascending: false })
            .limit(1);
          displayOrder = maxData && maxData.length > 0 ? maxData[0].display_order + 1 : 0;
        }
      }

      const updateData: Record<string, unknown> = {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Рецепт обновлён!");
    },
    onError: () => {
      toast.error("Ошибка при обновлении рецепта");
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Рецепт удалён");
    },
    onError: () => {
      toast.error("Ошибка при удалении рецепта");
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { error } = await supabase
        .from("recipes")
        .update({ is_favorite: isFavorite })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export function useSwapRecipeOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipeA, recipeB }: { recipeA: { id: string; display_order: number }; recipeB: { id: string; display_order: number } }) => {
      // Swap display_order values
      const { error: e1 } = await supabase.from("recipes").update({ display_order: recipeB.display_order }).eq("id", recipeA.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("recipes").update({ display_order: recipeA.display_order }).eq("id", recipeB.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: () => {
      toast.error("Ошибка при перемещении рецепта");
    },
  });
}

export function useMoveRecipeToCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipeId, newCategory }: { recipeId: string; newCategory: string }) => {
      // Get max display_order in target category
      const { data: maxData } = await supabase
        .from("recipes")
        .select("display_order")
        .eq("category", newCategory)
        .order("display_order", { ascending: false })
        .limit(1);

      const newOrder = maxData && maxData.length > 0 ? maxData[0].display_order + 1 : 0;

      const { error } = await supabase
        .from("recipes")
        .update({ category: newCategory, display_order: newOrder })
        .eq("id", recipeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Рецепт перемещён в другую категорию");
    },
    onError: () => {
      toast.error("Ошибка при перемещении рецепта");
    },
  });
}
