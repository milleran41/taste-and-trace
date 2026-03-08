/** Application-wide configuration constants */

export const APP_NAME = "YumBook";

export const APP_VERSION = "1.0.0";

/** Supabase Edge Function base URL */
export const EDGE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/** Default headers for Edge Function calls */
export const edgeFunctionHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
});

/** Recipe defaults */
export const RECIPE_DEFAULTS = {
  servings: 4,
  difficulty: "medium" as const,
  pageSize: 50,
};

/** Allowed difficulty values */
export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
