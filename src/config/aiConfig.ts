/** AI-related configuration */

/** Default AI model used across edge functions */
export const DEFAULT_AI_MODEL = "google/gemini-2.5-flash";

/** AI Gateway endpoint (used in edge functions, not client-side) */
export const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Edge function endpoints */
export const AI_ENDPOINTS = {
  parseRecipe: "parse-recipe",
  recipeAssistant: "recipe-assistant",
  appGuide: "app-guide",
  importRecipeUrl: "import-recipe-url",
} as const;
