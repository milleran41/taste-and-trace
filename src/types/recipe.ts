import { Tables } from "@/integrations/supabase/types";

export type Recipe = Tables<"recipes">;
export type Category = Tables<"categories">;

export interface RecipeFormData {
  title: string;
  description: string;
  category: string;
  cooking_time: string;
  difficulty: string;
  servings: number;
  ingredients: string[];
  instructions: string[];
  notes: string;
  tags: string[];
  image: string;
  screenshots?: string[];
  source?: unknown;
}
