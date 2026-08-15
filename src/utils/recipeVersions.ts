import { Recipe } from "@/types/recipe";

export interface RecipeVersionMeta {
  translationGroupId?: string;
  originalRecipeId?: string;
  language?: string;
  isTranslation?: boolean;
}

export interface RecipeSourceWithVersion {
  sourceType?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  translationGroupId?: string;
  originalRecipeId?: string;
  language?: string;
  isTranslation?: boolean;
  [key: string]: unknown;
}

const LAST_VERSION_PREFIX = "taste-trace:last-recipe-version:";

export function getRecipeSource(recipe?: Pick<Recipe, "source"> | null): RecipeSourceWithVersion {
  const source = recipe?.source;
  return source && typeof source === "object" && !Array.isArray(source) ? (source as RecipeSourceWithVersion) : {};
}

export function getRecipeVersionMeta(recipe?: Pick<Recipe, "id" | "source"> | null): RecipeVersionMeta {
  const source = getRecipeSource(recipe);
  return {
    translationGroupId: typeof source.translationGroupId === "string" ? source.translationGroupId : recipe?.id,
    originalRecipeId: typeof source.originalRecipeId === "string" ? source.originalRecipeId : recipe?.id,
    language: typeof source.language === "string" ? source.language : undefined,
    isTranslation: source.isTranslation === true,
  };
}

export function getRecipeTranslationGroupId(recipe?: Pick<Recipe, "id" | "source"> | null): string {
  return getRecipeVersionMeta(recipe).translationGroupId || recipe?.id || "";
}

export function isRecipeTranslation(recipe?: Pick<Recipe, "source"> | null): boolean {
  return getRecipeVersionMeta(recipe).isTranslation === true;
}

export function buildTranslationSource(recipe: Recipe, language: string): RecipeSourceWithVersion {
  const source = getRecipeSource(recipe);
  const groupId = getRecipeTranslationGroupId(recipe);
  return {
    ...source,
    translationGroupId: groupId,
    originalRecipeId: source.originalRecipeId || groupId,
    language,
    isTranslation: true,
  };
}

export function rememberRecipeVersion(groupId: string, recipeId: string): void {
  if (!groupId || !recipeId) return;
  try {
    window.localStorage.setItem(`${LAST_VERSION_PREFIX}${groupId}`, recipeId);
  } catch {
    // Ignore private-mode or storage quota errors.
  }
}

export function getRememberedRecipeVersion(groupId: string): string | null {
  if (!groupId) return null;
  try {
    return window.localStorage.getItem(`${LAST_VERSION_PREFIX}${groupId}`);
  } catch {
    return null;
  }
}

export function forgetRecipeVersion(groupId: string): void {
  if (!groupId) return;
  try {
    window.localStorage.removeItem(`${LAST_VERSION_PREFIX}${groupId}`);
  } catch {
    // Ignore private-mode or storage quota errors.
  }
}
