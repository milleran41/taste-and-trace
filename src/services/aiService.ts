/**
 * AI Service — centralised access to AI edge functions.
 * Components should call these helpers instead of making raw fetch calls.
 */

import { EDGE_FUNCTIONS_URL, edgeFunctionHeaders } from "@/config/appConfig";
import { AI_ENDPOINTS } from "@/config/aiConfig";

/* ------------------------------------------------------------------ */
/*  Parse recipe (text or image)                                      */
/* ------------------------------------------------------------------ */

export interface ParseRecipeTextParams {
  text: string;
}

export interface ParseRecipeImageParams {
  imageBase64: string;
  imageMediaType: string;
}

export async function parseRecipe(
  params: ParseRecipeTextParams | ParseRecipeImageParams
) {
  try {
    const resp = await fetch(
      `${EDGE_FUNCTIONS_URL}/${AI_ENDPOINTS.parseRecipe}`,
      {
        method: "POST",
        headers: edgeFunctionHeaders(),
        body: JSON.stringify(params),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `AI error: ${resp.status}`);
    }

    const data = await resp.json();
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (error) {
    console.error("[aiService] parseRecipe failed:", error);
    throw error instanceof Error
      ? error
      : new Error("AI service unavailable. Please try again later.");
  }
}

/* ------------------------------------------------------------------ */
/*  Recipe assistant (streaming)                                      */
/* ------------------------------------------------------------------ */

export interface AssistantParams {
  message: string;
  recipe: Record<string, unknown>;
  history?: { role: string; content: string }[];
}

export async function fetchAssistantStream(params: AssistantParams) {
  try {
    const resp = await fetch(
      `${EDGE_FUNCTIONS_URL}/${AI_ENDPOINTS.recipeAssistant}`,
      {
        method: "POST",
        headers: edgeFunctionHeaders(),
        body: JSON.stringify(params),
      }
    );

    if (!resp.ok || !resp.body) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `AI error: ${resp.status}`);
    }

    return resp.body;
  } catch (error) {
    console.error("[aiService] fetchAssistantStream failed:", error);
    throw error instanceof Error
      ? error
      : new Error("AI service unavailable. Please try again later.");
  }
}

/* ------------------------------------------------------------------ */
/*  Recipe translation through assistant backend                       */
/* ------------------------------------------------------------------ */

export interface TranslatedRecipeResult {
  recipe: {
    title: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    cooking_time: string;
    servings: number | null;
    difficulty: string;
    tags: string[];
    notes: string;
    category_hint?: string;
  };
  targetLanguage: string;
  quality?: {
    score: "high" | "medium" | "low";
    needs_review: boolean;
    warnings: Array<{ code?: string; message?: string }>;
  };
  timings?: {
    wall_seconds?: number;
  };
  model?: string;
}

function buildAssistantTranslationMessage(recipe: Record<string, unknown>, targetLanguage: string): string {
  return `Translate this saved recipe into ${targetLanguage}.

Return ONLY a valid JSON object. Do not use markdown. Do not add explanations.

JSON shape:
{
  "title": "string",
  "description": "string",
  "ingredients": ["string"],
  "instructions": ["string"],
  "cooking_time": "string",
  "servings": number_or_null,
  "difficulty": "easy|medium|hard",
  "tags": ["string"],
  "notes": "string",
  "category_hint": "string"
}

Critical rules:
- Translate the human-readable recipe text only.
- Preserve every quantity, unit, temperature, time, and serving count exactly.
- Do not add, remove, reorder, or merge ingredients.
- Do not add, remove, reorder, or merge instruction steps.
- Do not translate or include ids, sourceUrl, sourcePlatform, image, screenshots, timestamps, or technical metadata.
- This is a translation task, not a recipe rewrite.

Recipe object:
${JSON.stringify(recipe, null, 2)}`;
}

function extractJsonObject(rawContent: string): Record<string, unknown> {
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI did not return translated recipe JSON");
  return JSON.parse(jsonMatch[0]);
}

function normalizeRecipeTranslation(value: unknown): TranslatedRecipeResult["recipe"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI did not return a valid translated recipe");
  }
  const recipe = value as Record<string, unknown>;
  const normalizeArray = (items: unknown): string[] =>
    Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];

  return {
    title: String(recipe.title || "").trim(),
    description: String(recipe.description || "").trim(),
    ingredients: normalizeArray(recipe.ingredients),
    instructions: normalizeArray(recipe.instructions),
    cooking_time: String(recipe.cooking_time || "").trim(),
    servings: typeof recipe.servings === "number" ? recipe.servings : recipe.servings ? Number(recipe.servings) : null,
    difficulty: ["easy", "medium", "hard"].includes(String(recipe.difficulty)) ? String(recipe.difficulty) : "medium",
    tags: normalizeArray(recipe.tags),
    notes: String(recipe.notes || "").trim(),
    category_hint: String(recipe.category_hint || "").trim(),
  };
}

function readAssistantStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";

  return new Promise((resolve, reject) => {
    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              resolve(result);
              return;
            }

            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) result += content;
          }
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    void read();
  });
}

export async function translateRecipeWithAssistantBackend(params: {
  recipe: Record<string, unknown>;
  targetLanguage: string;
}): Promise<TranslatedRecipeResult> {
  try {
    const startedAt = performance.now();
    const message = buildAssistantTranslationMessage(params.recipe, params.targetLanguage);
    const resp = await fetch(
      `${EDGE_FUNCTIONS_URL}/${AI_ENDPOINTS.recipeAssistant}`,
      {
        method: "POST",
        headers: edgeFunctionHeaders(),
        body: JSON.stringify({
          message,
          recipe: params.recipe,
          history: [],
        }),
      }
    );

    if (!resp.ok || !resp.body) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `AI error: ${resp.status}`);
    }

    const assistantText = await readAssistantStreamText(resp.body);
    const recipe = normalizeRecipeTranslation(extractJsonObject(assistantText));
    return {
      recipe,
      targetLanguage: params.targetLanguage,
      timings: { wall_seconds: Math.round(performance.now() - startedAt) / 1000 },
      model: "recipe-assistant",
    };
  } catch (error) {
    console.error("[aiService] translateRecipeWithAssistantBackend failed:", error);
    throw error instanceof Error
      ? error
      : new Error("AI service unavailable. Please try again later.");
  }
}

/* ------------------------------------------------------------------ */
/*  App guide (streaming)                                             */
/* ------------------------------------------------------------------ */

export interface GuideParams {
  message: string;
  history?: { role: string; content: string }[];
  context?: string;
}

export async function fetchGuideStream(params: GuideParams) {
  try {
    const resp = await fetch(
      `${EDGE_FUNCTIONS_URL}/${AI_ENDPOINTS.appGuide}`,
      {
        method: "POST",
        headers: edgeFunctionHeaders(),
        body: JSON.stringify(params),
      }
    );

    if (!resp.ok || !resp.body) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `AI error: ${resp.status}`);
    }

    return resp.body;
  } catch (error) {
    console.error("[aiService] fetchGuideStream failed:", error);
    throw error instanceof Error
      ? error
      : new Error("AI service unavailable. Please try again later.");
  }
}

/* ------------------------------------------------------------------ */
/*  URL import                                                        */
/* ------------------------------------------------------------------ */

export async function importRecipeFromUrl(url: string) {
  try {
    const resp = await fetch(
      `${EDGE_FUNCTIONS_URL}/${AI_ENDPOINTS.importRecipeUrl}`,
      {
        method: "POST",
        headers: edgeFunctionHeaders(),
        body: JSON.stringify({ url }),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Import error: ${resp.status}`);
    }

    return resp.json();
  } catch (error) {
    console.error("[aiService] importRecipeFromUrl failed:", error);
    throw error instanceof Error
      ? error
      : new Error("AI service unavailable. Please try again later.");
  }
}
