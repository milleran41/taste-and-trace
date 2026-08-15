export type RecipeParserContext = {
  sourceUrl?: string;
  title?: string;
  sourceType?: string;
  sourcePlatform?: string;
  detectedLanguage?: string;
};

export type ParseRecipeTextParams = {
  apiKey: string;
  text: string;
  context?: RecipeParserContext;
};

export class RecipeParserError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "RECIPE_PARSE_FAILED") {
    super(message);
    this.name = "RecipeParserError";
    this.status = status;
    this.code = code;
  }
}

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

export function extractJsonObject(rawContent: string, noJsonMessage = "Не удалось распознать рецепт на этой странице", noJsonStatus = 422): unknown {
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("No JSON found in response:", rawContent);
    throw new RecipeParserError(noJsonMessage, noJsonStatus, "RECIPE_JSON_NOT_FOUND");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("Invalid JSON in AI response:", error);
    throw new RecipeParserError("AI не вернул корректный JSON", 500, "RECIPE_JSON_INVALID");
  }
}

export function normalizeDifficulty(value: unknown): string {
  const difficultyMap: Record<string, string> = {
    "легко": "easy",
    "easy": "easy",
    "простой": "easy",
    "просто": "easy",
    "средне": "medium",
    "medium": "medium",
    "средний": "medium",
    "сложно": "hard",
    "hard": "hard",
    "сложный": "hard",
  };

  if (typeof value !== "string" || !value.trim()) return "medium";
  return difficultyMap[value.toLowerCase()] || "medium";
}

function buildStrictRecipeSystemPrompt(context: RecipeParserContext = {}): string {
  const sourceUrl = context.sourceUrl || "";
  const languageNote = context.detectedLanguage
    ? `\n- Текст распознан из видео; предполагаемый язык речи: ${context.detectedLanguage}. Не переводи рецепт, пиши на языке оригинального текста.`
    : "";

  return `Ты — строгий парсер кулинарных рецептов. Извлеки рецепт из текста и верни ТОЛЬКО валидный JSON.

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:
- LANGUAGE LOCK: return title, description, ingredients, instructions, tags, notes, and category_hint in the same language as the source recipe text. Do not translate any field into the language of this prompt, the app UI, or the user. If the source text is mixed, preserve the original wording per field; never translate only some fields.
- ИЗВЛЕКАЙ ТОЛЬКО ТО, ЧТО РЕАЛЬНО ЕСТЬ В ТЕКСТЕ
- ЗАПРЕЩЕНО придумывать ингредиенты, шаги или данные
- Если в тексте нет конкретных ингредиентов — верни пустой массив
- Если шаги не описаны явно, но есть субтитры видео с описанием процесса приготовления — восстанови пошаговые инструкции из субтитров, разбив процесс на логические шаги
- Если данных недостаточно для рецепта — верни JSON с полем "error": "Недостаточно данных для извлечения рецепта"
- Удали разговорную речь, рекламу, личные истории
- Пиши на языке оригинала рецепта${languageNote}
- difficulty ДОЛЖЕН быть: "easy", "medium" или "hard"

Верни JSON:
{
  "title": "название из текста",
  "description": "краткое описание (если есть в тексте)",
  "ingredients": ["точно как в тексте с количествами"],
  "instructions": ["шаги из текста"],
  "cooking_time": "время (если указано)",
  "servings": число_порций_или_null,
  "difficulty": "easy|medium|hard",
  "tags": ["теги если есть"],
  "notes": "полезные советы из текста",
  "category_hint": "категория",
  "source": "${sourceUrl}"
}

Если рецепт невозможно извлечь, верни:
{"error": "Недостаточно данных для извлечения рецепта"}`;
}

export function normalizeRecipe(parsedValue: unknown): Record<string, unknown> {
  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    throw new RecipeParserError("AI не вернул корректный JSON", 500, "RECIPE_JSON_INVALID");
  }

  const parsed = parsedValue as Record<string, unknown>;

  if (parsed.error) {
    throw new RecipeParserError(String(parsed.error), 422, "RECIPE_TEXT_INSUFFICIENT");
  }

  if (!parsed.title) {
    throw new RecipeParserError("Не удалось извлечь достаточно данных для рецепта из этого источника", 422, "RECIPE_TEXT_INSUFFICIENT");
  }

  if (!Array.isArray(parsed.ingredients)) parsed.ingredients = [];
  if (!Array.isArray(parsed.instructions)) parsed.instructions = [];
  if (!Array.isArray(parsed.tags)) parsed.tags = [];
  parsed.difficulty = normalizeDifficulty(parsed.difficulty);

  return parsed;
}

export async function parseRecipeText(params: ParseRecipeTextParams): Promise<Record<string, unknown>> {
  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: buildStrictRecipeSystemPrompt(params.context) },
        { role: "user", content: `Extract a recipe STRICTLY from this text. Keep every output field in the original source language; do not translate anything and do not invent anything:\n\n${params.text}` },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new RecipeParserError("Превышен лимит запросов, попробуйте позже", 429, "AI_RATE_LIMITED");
    }
    if (response.status === 402) {
      throw new RecipeParserError("Недостаточно кредитов AI", 402, "AI_CREDITS_INSUFFICIENT");
    }

    const body = await response.text();
    console.error("AI gateway error:", response.status, body);
    throw new RecipeParserError(`AI gateway error: ${response.status}`, 500, "AI_GATEWAY_ERROR");
  }

  const aiResult = await response.json();
  const rawContent = aiResult.choices?.[0]?.message?.content ?? "";
  return normalizeRecipe(extractJsonObject(rawContent));
}
