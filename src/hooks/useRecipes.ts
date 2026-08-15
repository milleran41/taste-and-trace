import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Recipe, RecipeFormData } from "@/types/recipe";
import { cleanRecipeSections } from "@/utils/recipeContent";
import { getRecipeSource, getRecipeTranslationGroupId, isRecipeTranslation } from "@/utils/recipeVersions";
import { toast } from "sonner";
import i18n from "@/i18n";

const t = (key: string) => i18n.t(key);
const tr = (key: string, fallback: string) => {
  const value = i18n.t(key);
  return value === key ? fallback : value;
};
const RECIPE_CARD_SELECT = "id,title,category,display_order,description,tags,is_favorite,cooking_time,difficulty,servings,created_at,updated_at,source";

export function useRecipes(category?: string, enabled = true) {
  return useQuery({
    queryKey: ["recipes", category],
    queryFn: async () => {
      let query = supabase
        .from("recipes")
        .select(RECIPE_CARD_SELECT)
        .order("display_order", { ascending: true });

      if (category && category !== "all") {
        query = query.eq("category", category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as Recipe[]).filter((recipe) => !isRecipeTranslation(recipe));
    },
    enabled,
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

export function useRecipeVersions(recipe?: Recipe | null) {
  const groupId = getRecipeTranslationGroupId(recipe);
  const recipeSource = getRecipeSource(recipe);
  const originalRecipeId =
    recipe?.source && typeof recipe.source === "object" && !Array.isArray(recipe.source) && typeof (recipe.source as any).originalRecipeId === "string"
      ? (recipe.source as any).originalRecipeId
      : groupId;

  return useQuery({
    queryKey: ["recipe-versions", groupId, originalRecipeId, recipeSource.sourceUrl],
    queryFn: async () => {
      const byId = new Map<string, Recipe>();

      if (originalRecipeId) {
        const { data: original, error: originalError } = await supabase
          .from("recipes")
          .select("*")
          .eq("id", originalRecipeId)
          .maybeSingle();
        if (originalError) throw originalError;
        if (original) byId.set(original.id, original as Recipe);
      }

      if (groupId) {
        const { data: translations, error: translationsError } = await supabase
          .from("recipes")
          .select("*")
          .filter("source->>translationGroupId", "eq", groupId)
          .order("created_at", { ascending: true });
        if (translationsError) throw translationsError;
        for (const item of translations || []) {
          byId.set(item.id, item as Recipe);
        }
      }

      if (recipeSource.sourceUrl) {
        const { data: sameSourceRecipes, error: sameSourceError } = await supabase
          .from("recipes")
          .select("*")
          .filter("source->>sourceUrl", "eq", recipeSource.sourceUrl)
          .order("created_at", { ascending: true });
        if (sameSourceError) throw sameSourceError;
        for (const item of sameSourceRecipes || []) {
          const candidate = item as Recipe;
          const candidateSource = getRecipeSource(candidate);
          if (
            candidate.id === originalRecipeId ||
            candidate.id === groupId ||
            candidateSource.isTranslation === true ||
            candidateSource.translationGroupId === groupId ||
            candidateSource.originalRecipeId === originalRecipeId ||
            candidateSource.translationGroupId === originalRecipeId ||
            candidateSource.originalRecipeId === groupId
          ) {
            byId.set(candidate.id, candidate);
          }
        }
      }

      if (recipe) byId.set(recipe.id, recipe);
      return Array.from(byId.values());
    },
    enabled: !!recipe?.id,
  });
}

export function useRecipeCardImage(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["recipe-card-image", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select("image,screenshots")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Pick<Recipe, "image" | "screenshots">;
    },
    enabled: !!id && enabled,
    staleTime: 1000 * 60 * 10,
  });
}

export function useFavoriteRecipes(enabled = true) {
  return useQuery({
    queryKey: ["recipes", "favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(RECIPE_CARD_SELECT)
        .eq("is_favorite", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data as unknown as Recipe[]).filter((recipe) => !isRecipeTranslation(recipe));
    },
    enabled,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipe: RecipeFormData) => {
      const cleanedSections = cleanRecipeSections(recipe.ingredients, recipe.instructions);
      const { data: maxData } = await supabase
        .from("recipes")
        .select("display_order")
        .eq("category", recipe.category)
        .order("display_order", { ascending: false })
        .limit(1);

      const displayOrder = maxData && maxData.length > 0 ? maxData[0].display_order + 1 : 0;

      const { data, error } = await supabase
        .from("recipes")
        .insert({
          title: recipe.title,
          description: recipe.description,
          category: recipe.category,
          display_order: displayOrder,
          cooking_time: recipe.cooking_time,
          difficulty: recipe.difficulty,
          servings: recipe.servings,
          ingredients: cleanedSections.ingredients,
          instructions: cleanedSections.instructions,
          notes: recipe.notes,
          tags: recipe.tags,
          image: recipe.image,
          screenshots: recipe.screenshots || [],
          source: recipe.source || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe-versions"] });
      if (data?.id) {
        queryClient.setQueryData(["recipe", data.id], data as Recipe);
        queryClient.invalidateQueries({ queryKey: ["recipe", data.id] });
      }
      toast.success(t("recipe_created"));
    },
    onError: () => {
      toast.error(t("error_creating"));
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, recipe }: { id: string; recipe: Partial<RecipeFormData> }) => {
      const shouldCleanSections = recipe.ingredients !== undefined || recipe.instructions !== undefined;
      const cleanedSections = shouldCleanSections
        ? cleanRecipeSections(recipe.ingredients, recipe.instructions)
        : null;
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
        cooking_time: recipe.cooking_time || null,
        difficulty: recipe.difficulty || null,
        servings: recipe.servings,
        ingredients: recipe.ingredients !== undefined ? cleanedSections?.ingredients : recipe.ingredients,
        instructions: shouldCleanSections ? cleanedSections?.instructions : recipe.instructions,
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      if (data?.id) {
        queryClient.setQueryData(["recipe", data.id], data as Recipe);
        queryClient.invalidateQueries({ queryKey: ["recipe", data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["recipe-versions"] });
      toast.success(t("recipe_updated"));
    },
    onError: () => {
      toast.error(t("error_updating"));
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (idOrIds: string | string[]) => {
      const ids = Array.isArray(idOrIds) ? idOrIds.filter(Boolean) : [idOrIds].filter(Boolean);
      if (ids.length === 0) return ids;

      const query = supabase.from("recipes").delete();
      const { data, error } = ids.length === 1
        ? await query.eq("id", ids[0]).select("id")
        : await query.in("id", ids).select("id");
      if (error) throw error;

      const deletedIds = (data || []).map((row) => String(row.id));
      if (deletedIds.length === 0) {
        throw new Error(tr("recipe_delete_no_rows", "Recipe was not deleted. Please try again after reopening the app."));
      }
      if (deletedIds.length < ids.length) {
        console.warn("Some recipe versions were not deleted:", {
          requestedIds: ids,
          deletedIds,
        });
      }
      return deletedIds;
    },
    onSuccess: (deletedIds) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      for (const id of deletedIds || []) {
        queryClient.removeQueries({ queryKey: ["recipe", id] });
      }
      queryClient.invalidateQueries({ queryKey: ["recipe-versions"] });
      toast.success(t("recipe_deleted"));
    },
    onError: (error) => {
      console.error("Delete recipe error:", error);
      toast.error(error instanceof Error ? error.message : t("error_deleting"));
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipe", variables.id] });
    },
    onError: (error) => {
      console.error("Toggle favorite error:", error);
      toast.error(t("error_updating"));
    },
  });
}

export function useReorderRecipes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipes: { id: string; display_order: number }[]) => {
      const results = await Promise.all(
        recipes.map((recipe) =>
          supabase
            .from("recipes")
            .update({ display_order: recipe.display_order })
            .eq("id", recipe.id)
        )
      );

      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    onMutate: async (recipes) => {
      await queryClient.cancelQueries({ queryKey: ["recipes"] });

      const previousQueries = queryClient.getQueriesData<Recipe[]>({ queryKey: ["recipes"] });
      const orderById = new Map(recipes.map((recipe) => [recipe.id, recipe.display_order]));

      queryClient.setQueriesData<Recipe[]>({ queryKey: ["recipes"] }, (current) => {
        if (!current) return current;

        return current
          .map((recipe) => {
            const displayOrder = orderById.get(recipe.id);
            return displayOrder === undefined ? recipe : { ...recipe, display_order: displayOrder };
          })
          .sort((a, b) => a.display_order - b.display_order);
      });

      return { previousQueries };
    },
    onError: (_error, _recipes, context) => {
      context?.previousQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error(t("error_moving_recipe"));
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
      const { error: e1 } = await supabase.from("recipes").update({ display_order: recipeB.display_order }).eq("id", recipeA.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("recipes").update({ display_order: recipeA.display_order }).eq("id", recipeB.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: () => {
      toast.error(t("error_moving_recipe"));
    },
  });
}

export function useMoveRecipeToCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipeId, newCategory }: { recipeId: string; newCategory: string }) => {
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
      toast.success(t("recipe_moved"));
    },
    onError: () => {
      toast.error(t("error_moving_recipe"));
    },
  });
}
