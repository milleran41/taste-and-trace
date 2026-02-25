import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchYouTubeContent(videoId: string): Promise<string> {
  // Fetch the watch page to get title, description from meta tags
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const resp = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    },
  });
  const html = await resp.text();

  // Extract title
  const titleMatch = html.match(/<meta\s+name="title"\s+content="([^"]*)"/) ||
    html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ||
    html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch?.[1] || "";

  // Extract description
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/) ||
    html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/) ;
  const description = descMatch?.[1] || "";

  // Try to extract captions/transcript from the page's initial data
  let transcript = "";
  try {
    // YouTube embeds caption track URLs in the page source
    const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"/s);
    if (captionMatch) {
      const captionsJson = JSON.parse(captionMatch[1]);
      const tracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) {
        // Prefer Russian, then any
        const ruTrack = tracks.find((t: any) => t.languageCode === "ru") || tracks[0];
        if (ruTrack?.baseUrl) {
          const captionResp = await fetch(ruTrack.baseUrl);
          const captionXml = await captionResp.text();
          // Extract text from XML captions
          transcript = captionXml
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .trim();
        }
      }
    }
  } catch (e) {
    console.log("Could not extract captions:", e);
  }

  // Also try to get structured data from ytInitialData
  let expandedDescription = "";
  try {
    const initDataMatch = html.match(/var\s+ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
    if (initDataMatch) {
      // Extract description from engagement panels or video details
      const descFromData = initDataMatch[1].match(/"attributedDescription":\s*\{"content":\s*"([^"]{20,})"/);
      if (descFromData) {
        expandedDescription = descFromData[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
  } catch (e) {
    console.log("Could not extract ytInitialData:", e);
  }

  const parts = [`Название видео: ${title}`];
  if (description) parts.push(`Описание: ${description}`);
  if (expandedDescription && expandedDescription.length > description.length) {
    parts.push(`Полное описание: ${expandedDescription}`);
  }
  if (transcript) parts.push(`Субтитры видео:\n${transcript.slice(0, 12000)}`);

  const result = parts.join("\n\n");
  console.log("YouTube content extracted, length:", result.length);
  return result;
}

async function fetchPageContent(url: string): Promise<string> {
  const pageResponse = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    },
  });

  if (!pageResponse.ok) {
    throw new Error(`Failed to fetch URL: ${pageResponse.status}`);
  }

  const html = await pageResponse.text();

  // Try to extract JSON-LD recipe schema first (many recipe sites use this)
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      const jsonContent = match.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      try {
        const parsed = JSON.parse(jsonContent);
        const recipes = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of recipes) {
          if (item["@type"] === "Recipe" || item["@type"]?.includes?.("Recipe")) {
            console.log("Found JSON-LD Recipe schema!");
            return `JSON-LD рецепт:\n${JSON.stringify(item, null, 2).slice(0, 15000)}`;
          }
          // Check @graph
          if (item["@graph"]) {
            for (const g of item["@graph"]) {
              if (g["@type"] === "Recipe" || g["@type"]?.includes?.("Recipe")) {
                console.log("Found JSON-LD Recipe in @graph!");
                return `JSON-LD рецепт:\n${JSON.stringify(g, null, 2).slice(0, 15000)}`;
              }
            }
          }
        }
      } catch {
        // not valid JSON, skip
      }
    }
  }

  // Fallback: extract text content
  const pageContent = html
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
    .slice(0, 15000);

  return pageContent;
}

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

    console.log("Processing URL:", url);
    let pageContent = "";

    try {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        console.log("Detected YouTube video:", videoId);
        pageContent = await fetchYouTubeContent(videoId);
      } else {
        pageContent = await fetchPageContent(url);
      }
    } catch (fetchError) {
      console.error("Error fetching URL:", fetchError);
      throw new Error("Не удалось загрузить страницу. Проверьте ссылку и попробуйте снова.");
    }

    if (pageContent.length < 50) {
      throw new Error("Не удалось извлечь содержимое страницы. Возможно, сайт блокирует доступ.");
    }

    console.log("Sending to AI, content length:", pageContent.length);

    const systemPrompt = `Ты — профессиональный парсер кулинарных рецептов. Из предоставленного текста (веб-страницы, описания видео или субтитров) извлеки рецепт и верни ТОЛЬКО валидный JSON.

ПРАВИЛА:
- Убери разговорную речь, рекламу, личные истории
- Оставь только рецепт
- Выдели ингредиенты с точными количествами
- Если количества не указаны — предположи разумные бытовые меры
- Определи время приготовления, порции, категорию
- Не копируй текст дословно, переформулируй структурированно
- Пиши на языке оригинала рецепта
- difficulty ДОЛЖЕН быть одним из: "easy", "medium", "hard"
- Если текст содержит субтитры видео — извлеки рецепт из устной речи

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
        model: "google/gemini-2.5-flash",
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
