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

    const { url } = await req.json();
    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Fetch page content
    console.log("Fetching URL:", url);
    let pageContent = "";

    try {
      const pageResponse = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!pageResponse.ok) {
        throw new Error(`Failed to fetch URL: ${pageResponse.status}`);
      }

      const html = await pageResponse.text();

      // Extract text content from HTML (simple approach)
      pageContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 15000); // Limit content size
    } catch (fetchError) {
      console.error("Error fetching URL:", fetchError);
      throw new Error("Не удалось загрузить страницу. Проверьте ссылку и попробуйте снова.");
    }

    if (pageContent.length < 50) {
      throw new Error("Не удалось извлечь содержимое страницы. Возможно, сайт блокирует доступ.");
    }

    // Step 2: Send to AI for parsing
    console.log("Sending to AI, content length:", pageContent.length);

    const systemPrompt = `Ты — профессиональный парсер кулинарных рецептов. Из предоставленного текста веб-страницы извлеки рецепт и верни ТОЛЬКО валидный JSON.

ПРАВИЛА:
- Убери разговорную речь, рекламу, личные истории
- Оставь только рецепт
- Выдели ингредиенты с точными количествами
- Если количества не указаны — предположи разумные бытовые меры
- Определи время приготовления, порции, категорию
- Не копируй текст дословно, переформулируй структурированно
- Пиши на языке оригинала рецепта
- difficulty ДОЛЖЕН быть одним из: "easy", "medium", "hard"

Верни JSON:
{
  "title": "название",
  "description": "краткое описание блюда",
  "ingredients": ["ингредиент 1 с количеством", "ингредиент 2"],
  "instructions": ["шаг 1", "шаг 2"],
  "cooking_time": "время (например: 30 минут)",
  "servings": число_порций,
  "difficulty": "easy|medium|hard",
  "tags": ["тег1", "тег2"],
  "notes": "полезные советы",
  "category_hint": "подсказка категории (суп, салат, десерт, выпечка, и т.д.)"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Извлеки рецепт из этого текста:\n\n${pageContent}` },
        ],
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

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content ?? "";

    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in response:", rawContent);
      throw new Error("AI не смог распознать рецепт на этой странице");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Normalize difficulty
    const difficultyMap: Record<string, string> = {
      "легко": "easy", "easy": "easy", "простой": "easy",
      "средне": "medium", "medium": "medium", "средний": "medium",
      "сложно": "hard", "hard": "hard", "сложный": "hard",
    };
    if (parsed.difficulty) {
      parsed.difficulty = difficultyMap[parsed.difficulty.toLowerCase()] || "medium";
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("import-recipe-url error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестная ошибка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
