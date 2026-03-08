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
