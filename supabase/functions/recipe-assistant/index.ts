import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Detect if user is asking about ingredient substitution
function isSubstitutionQuery(message: string): boolean {
  const patterns = [
    /замен/i, /заменить/i, /вместо/i, /аналог/i, /альтернатив/i,
    /без\s+\w+/i, /нет\s+\w+/i, /чем\s+заменить/i, /substitut/i, /replace/i,
  ];
  return patterns.some((p) => p.test(message));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { message, recipe, history } = await req.json();

    if (!message || !recipe) {
      return new Response(
        JSON.stringify({ error: "message and recipe are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.join(", ") : "";
    const instructions = Array.isArray(recipe.instructions) ? recipe.instructions.join("\n") : "";

    const needsSearch = isSubstitutionQuery(message);

    let systemPrompt: string;

    if (needsSearch) {
      // For substitution queries — instruct to use web search and provide structured answer
      systemPrompt = `Ты — кулинарный эксперт с доступом к интернету. Тебе задан вопрос о замене ингредиентов в рецепте.

Текущий рецепт:
Название: ${recipe.title}
Ингредиенты: ${ingredients}
Приготовление: ${instructions}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:
1. Используй поиск в интернете для нахождения актуальных замен
2. НЕ придумывай замены — только проверенные из кулинарных источников
3. Указывай источники информации
4. Форматируй ответ СТРОГО по шаблону:

**Замена для [ингредиент]:**

🔄 **Варианты замены:**
- [замена 1] — [пропорция]
- [замена 2] — [пропорция]

✅ **Подходит для:**
- [случай 1]
- [случай 2]

❌ **Не подходит для:**
- [случай 1]

📌 **Источники:**
- [название источника]

Если поиск не дал результатов — напиши: "Не удалось найти проверенные замены в интернете."
НЕ генерируй ответ без данных из поиска.`;
    } else {
      systemPrompt = `Ты — кулинарный помощник. Ты отвечаешь на вопросы, связанные с конкретным рецептом.

Текущий рецепт:
Название: ${recipe.title}
Категория: ${recipe.category || "не указана"}
Ингредиенты: ${ingredients}
Приготовление: ${instructions}
Порции: ${recipe.servings || "не указано"}
Время: ${recipe.cooking_time || "не указано"}
Заметки: ${recipe.notes || "нет"}

Правила:
- Давай короткие, практичные ответы
- Отвечай структурированно с markdown
- Отвечай на языке пользователя
- Используй поиск в интернете когда нужно найти дополнительную информацию`;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    // Build request body — use google_search tool for grounded answers
    const requestBody: any = {
      model: "google/gemini-2.5-flash",
      messages,
      stream: true,
    };

    // Enable Gemini's built-in google_search tool for web grounding
    if (needsSearch) {
      requestBody.tools = [
        { type: "function", function: { name: "google_search", description: "Search the web for information", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }
      ];
    }

    console.log("Recipe assistant request, needsSearch:", needsSearch, "message:", message.slice(0, 100));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Недостаточно кредитов AI" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("recipe-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестная ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
