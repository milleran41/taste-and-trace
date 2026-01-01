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
        .order("created_at", { ascending: false });

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
        .order("created_at", { ascending: false });

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
      const { data, error } = await supabase
        .from("recipes")
        .update({
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
        })
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
