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

function detectPlatform(url: string): string {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/vk\.com|vk\.video/i.test(url)) return "vk";
  return "website";
}

function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

function extractTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

async function fetchYouTubeContent(videoId: string): Promise<string> {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const resp = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const html = await resp.text();

  const titleMatch = html.match(/<meta\s+name="title"\s+content="([^"]*)"/) ||
    html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ||
    html.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch?.[1] || "";

  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/) ||
    html.match(/<meta\s+property="og:description"\s+content="([^"]*)">/);
  const description = descMatch?.[1] || "";

  // Extract captions/subtitles - try multiple patterns
  let transcript = "";
  try {
    const captionPatterns = [
      /"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"/s,
      /"playerCaptionsTracklistRenderer":\s*(\{.*?"captionTracks".*?\})/s,
    ];
    
    let tracks: any[] | null = null;
    for (const pattern of captionPatterns) {
      const captionMatch = html.match(pattern);
      if (captionMatch) {
        try {
          const captionsJson = JSON.parse(captionMatch[1]);
          tracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks || captionsJson?.captionTracks;
          if (tracks) break;
        } catch { /* try next pattern */ }
      }
    }
    
    if (tracks && tracks.length > 0) {
      const ruTrack = tracks.find((t: any) => t.languageCode === "ru") || 
                      tracks.find((t: any) => t.languageCode?.startsWith("ru")) || 
                      tracks[0];
      if (ruTrack?.baseUrl) {
        const captionResp = await fetch(ruTrack.baseUrl);
        const captionXml = await captionResp.text();
        transcript = captionXml
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\s+/g, " ").trim();
      }
    }
  } catch (e) {
    console.log("Could not extract captions:", e);
  }

  // Extract expanded description from ytInitialData - try multiple patterns
  let expandedDescription = "";
  try {
    const dataPatterns = [
      /var\s+ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s,
      /ytInitialData\s*=\s*'(\{.+?\})'\s*;/s,
      /window\["ytInitialData"\]\s*=\s*(\{.+?\})\s*;/s,
    ];
    
    for (const pattern of dataPatterns) {
      const initDataMatch = html.match(pattern);
      if (initDataMatch) {
        // Try multiple description extraction patterns
        const descPatterns = [
          /"attributedDescription":\s*\{"content":\s*"([^"]{20,})"/,
          /"description":\s*\{"simpleText":\s*"([^"]{20,})"/,
          /"shortDescription":\s*"([^"]{20,})"/,
        ];
        for (const dp of descPatterns) {
          const descFromData = initDataMatch[1].match(dp);
          if (descFromData) {
            expandedDescription = descFromData[1]
              .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
            break;
          }
        }
        if (expandedDescription) break;
      }
    }
  } catch (e) {
    console.log("Could not extract ytInitialData description:", e);
  }

  // Also try ytInitialPlayerResponse for description
  if (!expandedDescription) {
    try {
      const playerMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s) ||
        html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
      if (playerMatch) {
        const shortDescMatch = playerMatch[1].match(/"shortDescription":\s*"((?:[^"\\]|\\.)*)"/s);
        if (shortDescMatch && shortDescMatch[1].length > 50) {
          expandedDescription = shortDescMatch[1]
            .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        }
      }
    } catch (e) {
      console.log("Could not extract playerResponse:", e);
    }
  }

  console.log("YouTube extraction - title:", title.length, "desc:", description.length, 
    "expanded:", expandedDescription.length, "transcript:", transcript.length);

  // Be more lenient - allow if we have at least a description with some content
  if (!transcript && expandedDescription.length < 50 && description.length < 50) {
    throw new Error("NO_CONTENT");
  }

  const parts = [`Название видео: ${title}`];
  if (description) parts.push(`Описание: ${description}`);
  if (expandedDescription && expandedDescription.length > description.length) {
    parts.push(`Полное описание: ${expandedDescription}`);
  }
  if (transcript) parts.push(`Субтитры видео:\n${transcript.slice(0, 15000)}`);

  return parts.join("\n\n");
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

  // Try JSON-LD Recipe schema first
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      const jsonContent = match.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      try {
        const parsed = JSON.parse(jsonContent);
        const recipes = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of recipes) {
          if (item["@type"] === "Recipe" || item["@type"]?.includes?.("Recipe")) {
            return `JSON-LD рецепт:\n${JSON.stringify(item, null, 2).slice(0, 15000)}`;
          }
          if (item["@graph"]) {
            for (const g of item["@graph"]) {
              if (g["@type"] === "Recipe" || g["@type"]?.includes?.("Recipe")) {
                return `JSON-LD рецепт:\n${JSON.stringify(g, null, 2).slice(0, 15000)}`;
              }
            }
          }
        }
      } catch { /* skip invalid JSON */ }
    }
  }

  // Fallback: extract clean text
  const pageContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim()
    .slice(0, 15000);

  if (pageContent.length < 100) {
    throw new Error("NO_CONTENT");
  }

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
      } else if (extractTikTokUrl(url)) {
        // TikTok pages are JS-rendered, we can't reliably scrape them
        throw new Error("NO_CONTENT");
      } else {
        pageContent = await fetchPageContent(url);
      }
    } catch (fetchError: any) {
      if (fetchError?.message === "NO_CONTENT") {
        return new Response(
          JSON.stringify({ error: "Не удалось получить данные из источника. Нет субтитров, описания или текста на странице." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Error fetching URL:", fetchError);
      return new Response(
        JSON.stringify({ error: "Не удалось загрузить страницу. Проверьте ссылку и попробуйте снова." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending to AI, content length:", pageContent.length);

    const systemPrompt = `Ты — строгий парсер кулинарных рецептов. Извлеки рецепт из текста и верни ТОЛЬКО валидный JSON.

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:
- ИЗВЛЕКАЙ ТОЛЬКО ТО, ЧТО РЕАЛЬНО ЕСТЬ В ТЕКСТЕ
- ЗАПРЕЩЕНО придумывать ингредиенты, шаги или данные
- Если в тексте нет конкретных ингредиентов — верни пустой массив
- Если шаги не описаны явно, но есть субтитры видео с описанием процесса приготовления — восстанови пошаговые инструкции из субтитров, разбив процесс на логические шаги
- Если данных недостаточно для рецепта — верни JSON с полем "error": "Недостаточно данных для извлечения рецепта"
- Удали разговорную речь, рекламу, личные истории
- Пиши на языке оригинала рецепта
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
  "source": "${url}"
}

Если рецепт невозможно извлечь, верни:
{"error": "Недостаточно данных для извлечения рецепта"}`;

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
          { role: "user", content: `Извлеки рецепт СТРОГО из этого текста (не придумывай ничего):\n\n${pageContent}` },
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
      return new Response(
        JSON.stringify({ error: "Не удалось распознать рецепт на этой странице" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // If AI returned an error (insufficient data)
    if (parsed.error) {
      return new Response(
        JSON.stringify({ error: parsed.error }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate: must have at least a title
    if (!parsed.title) {
      return new Response(
        JSON.stringify({ error: "Не удалось извлечь достаточно данных для рецепта из этого источника" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure arrays exist even if empty
    if (!parsed.ingredients) parsed.ingredients = [];
    if (!parsed.instructions) parsed.instructions = [];

    // Normalize difficulty
    const difficultyMap: Record<string, string> = {
      "легко": "easy", "easy": "easy", "простой": "easy",
      "средне": "medium", "medium": "medium", "средний": "medium",
      "сложно": "hard", "hard": "hard", "сложный": "hard",
    };
    if (parsed.difficulty) {
      parsed.difficulty = difficultyMap[parsed.difficulty.toLowerCase()] || "medium";
    }

    // Build source metadata
    const platform = detectPlatform(url);
    const videoId = extractYouTubeVideoId(url);
    parsed.source = {
      sourceType: videoId || /tiktok\.com/i.test(url) ? "video" : "article",
      sourceUrl: url,
      sourcePlatform: platform,
    };

    // Add thumbnail for YouTube
    if (videoId) {
      parsed.thumbnail = getYouTubeThumbnail(videoId);
    }

    // Try to extract og:image for non-YouTube sources
    if (!parsed.thumbnail && !videoId) {
      try {
        const pageResp = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        const html = await pageResp.text();
        const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i);
        if (ogMatch?.[1]) {
          parsed.thumbnail = ogMatch[1];
        }
      } catch { /* ignore */ }
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
