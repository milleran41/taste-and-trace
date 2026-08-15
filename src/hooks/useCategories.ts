import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Category } from "@/types/recipe";
import { DEFAULT_CATEGORIES } from "@/utils/categoryConstants";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      
      const remoteCategories = data as Category[];
      
      // If the user has remote categories that match the default IDs (e.g., they edited the label), use the remote ones.
      // Otherwise, use the defaults for those specific IDs, plus any fully custom categories they added.
      const remoteDefaultIds = remoteCategories
        .filter(c => c.id.startsWith("default_"))
        .map(c => c.id);

      const missingDefaults = DEFAULT_CATEGORIES.filter(
        defaultCat => !remoteDefaultIds.includes(defaultCat.id)
      );

      // Combine missing defaults with remote categories and sort by display_order
      const allCategories = [...missingDefaults, ...remoteCategories].sort((a, b) => {
        return (a.display_order ?? 0) - (b.display_order ?? 0);
      });

      return allCategories;
    },
  });
}
