import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const systemPrompt = `Ты — кулинарный помощник. Ты отвечаешь ТОЛЬКО на вопросы, связанные с конкретным рецептом, который тебе передан. Не придумывай ингредиенты, которых нет в рецепте.

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
- Отвечай структурированно: заголовок, краткий ответ, при необходимости — список шагов
- Отвечай на языке пользователя
- Не упоминай другие рецепты
- Используй markdown для форматирования`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: true,
      }),
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
