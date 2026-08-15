import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseRecipeText, RecipeParserError } from "../_shared/recipe-parser.ts";
import { detectPlatform, extractYouTubeVideoId, getYouTubeThumbnail } from "../_shared/source-metadata.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractTikTokUrl(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

type YouTubeCaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  name?: { simpleText?: string; runs?: { text?: string }[] };
  kind?: string;
  vssId?: string;
};

type YouTubeMetadata = {
  title: string;
  description: string;
  descriptionSource: string;
  originalLanguage?: string;
  captionTracks: YouTubeCaptionTrack[];
  hasPlayerResponse: boolean;
  hasInitialData: boolean;
};

const MAX_CAPTION_TRACK_ATTEMPTS = 6;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMetaContent(html: string, nameOrProperty: string): string {
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function extractBalancedJsonAfter(html: string, marker: string): unknown | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;

  const start = html.indexOf("{", markerIndex + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function getTextFromRuns(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.simpleText === "string") return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map((run: any) => run?.text || "").join("");
  }
  return "";
}

function collectDeepTextValues(root: unknown, predicate: (key: string, value: any) => boolean): string[] {
  const results: string[] = [];
  const seen = new Set<unknown>();

  function visit(value: any, key = "") {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    if (predicate(key, value)) {
      const text = getTextFromRuns(value);
      if (text) results.push(cleanText(text));
      if (typeof value.content === "string") results.push(cleanText(value.content));
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }

    for (const [childKey, childValue] of Object.entries(value)) {
      visit(childValue, childKey);
    }
  }

  visit(root);
  return [...new Set(results.filter(Boolean))];
}

function pickLongest(values: string[]): string {
  return values.reduce((best, value) => value.length > best.length ? value : best, "");
}

function getTrackName(track: YouTubeCaptionTrack): string {
  return getTextFromRuns(track.name);
}

function isAutomaticTrack(track: YouTubeCaptionTrack): boolean {
  return track.kind === "asr" || /^a\./i.test(track.vssId || "");
}

function normalizeLanguage(value?: string): string {
  return (value || "").toLowerCase().replace("_", "-");
}

function rankCaptionTrack(track: YouTubeCaptionTrack, originalLanguage?: string): number {
  const language = normalizeLanguage(track.languageCode);
  const original = normalizeLanguage(originalLanguage);
  let languageRank = 9;

  if (original && language === original) languageRank = 0;
  else if (original && language.startsWith(`${original}-`)) languageRank = 1;
  else if (!original && language === "en") languageRank = 2;
  else if (!original && language.startsWith("en-")) languageRank = 3;

  return languageRank * 10 + (isAutomaticTrack(track) ? 1 : 0);
}

function selectCaptionTracks(tracks: YouTubeCaptionTrack[], originalLanguage?: string): YouTubeCaptionTrack[] {
  return [...tracks]
    .filter((track) => track?.baseUrl)
    .sort((a, b) => rankCaptionTrack(a, originalLanguage) - rankCaptionTrack(b, originalLanguage));
}

function parseJson3Captions(raw: string): string {
  const parsed = JSON.parse(raw);
  const chunks: string[] = [];
  for (const event of parsed.events || []) {
    for (const seg of event.segs || []) {
      if (seg?.utf8) chunks.push(seg.utf8);
    }
  }
  return cleanText(chunks.join(" "));
}

function parseVttCaptions(raw: string): string {
  return cleanText(raw
    .replace(/\uFEFF/g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed &&
        trimmed !== "WEBVTT" &&
        !trimmed.includes("-->") &&
        !/^(Kind|Language):/i.test(trimmed) &&
        !/^\d+$/.test(trimmed);
    })
    .join(" ")
    .replace(/<[^>]+>/g, " "));
}

function parseXmlCaptions(raw: string): string {
  return cleanText(raw.replace(/<[^>]+>/g, " "));
}

function withCaptionFormat(baseUrl: string, format: "json3" | "vtt"): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("fmt", format);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function parseCaptionResponse(raw: string, formatHint: "json3" | "vtt" | "xml"): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (formatHint === "json3" || trimmed.startsWith("{")) return parseJson3Captions(trimmed);
  if (formatHint === "vtt" || trimmed.startsWith("WEBVTT")) return parseVttCaptions(trimmed);
  return parseXmlCaptions(trimmed);
}

async function fetchCaptionTextFromTrack(track: YouTubeCaptionTrack): Promise<string> {
  if (!track.baseUrl) return "";

  const attempts: { url: string; format: "json3" | "vtt" | "xml" }[] = [
    { url: withCaptionFormat(track.baseUrl, "json3"), format: "json3" },
    { url: withCaptionFormat(track.baseUrl, "vtt"), format: "vtt" },
    { url: track.baseUrl, format: "xml" },
  ];

  const tried = new Set<string>();
  for (const attempt of attempts) {
    if (tried.has(attempt.url)) continue;
    tried.add(attempt.url);

    try {
      const response = await fetch(attempt.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          "Accept": "text/vtt,application/json,text/xml,text/plain,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        console.log("YouTube captions fetch failed:", response.status, attempt.format);
        if (response.status === 429) throw new Error("CAPTIONS_RATE_LIMITED");
        continue;
      }
      const raw = await response.text();
      const text = parseCaptionResponse(raw, attempt.format);
      if (text) return text;
    } catch (e) {
      if (e instanceof Error && e.message === "CAPTIONS_RATE_LIMITED") throw e;
      console.log("YouTube captions parse/fetch failed:", attempt.format, e instanceof Error ? e.message : e);
    }
  }

  return "";
}

async function fetchYouTubeCaptions(
  tracks: YouTubeCaptionTrack[],
  originalLanguage: string | undefined,
  videoId: string,
): Promise<string> {
  console.log("YouTube caption tracks found:", videoId, tracks.length);
  const rankedTracks = selectCaptionTracks(tracks, originalLanguage).slice(0, MAX_CAPTION_TRACK_ATTEMPTS);

  for (const track of rankedTracks) {
    const automatic = isAutomaticTrack(track);
    console.log("Trying YouTube caption track:", videoId, {
      language: track.languageCode || "unknown",
      automatic,
      name: getTrackName(track),
    });

    let text = "";
    try {
      text = await fetchCaptionTextFromTrack(track);
    } catch (e) {
      if (e instanceof Error && e.message === "CAPTIONS_RATE_LIMITED") {
        console.log("YouTube captions rate limited, stopping caption attempts:", videoId);
        break;
      }
      console.log("YouTube caption track failed:", videoId, e instanceof Error ? e.message : e);
    }
    console.log("YouTube caption track result:", videoId, {
      language: track.languageCode || "unknown",
      automatic,
      length: text.length,
    });
    if (text) return text;
  }

  return "";
}

function extractYouTubeMetadata(html: string): YouTubeMetadata {
  const playerResponse = extractBalancedJsonAfter(html, "ytInitialPlayerResponse") as any;
  const initialData = extractBalancedJsonAfter(html, "ytInitialData") as any;

  const metaTitle = extractMetaContent(html, "title") ||
    extractMetaContent(html, "og:title") ||
    cleanText(html.match(/<title>([^<]*)<\/title>/i)?.[1] || "");
  const title = cleanText(
    playerResponse?.videoDetails?.title ||
    getTextFromRuns(playerResponse?.microformat?.playerMicroformatRenderer?.title) ||
    metaTitle
  );

  const fullDescription = pickLongest([
    ...collectDeepTextValues(initialData, (key, value) =>
      key === "attributedDescription" && typeof value?.content === "string"
    ),
  ]);
  const shortDescription = cleanText(playerResponse?.videoDetails?.shortDescription || "");
  const microformatDescription = cleanText(getTextFromRuns(
    playerResponse?.microformat?.playerMicroformatRenderer?.description
  ));
  const metaDescription = extractMetaContent(html, "description") || extractMetaContent(html, "og:description");

  const descriptionCandidates = [
    { source: "initialData", text: fullDescription },
    { source: "videoDetails.shortDescription", text: shortDescription },
    { source: "playerResponse.microformat.description", text: microformatDescription },
    { source: "meta", text: metaDescription },
  ].filter((candidate) => candidate.text);

  const description = descriptionCandidates[0]?.text || "";
  const descriptionSource = descriptionCandidates[0]?.source || "none";
  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const detectedOriginalLanguage =
    playerResponse?.videoDetails?.language ||
    playerResponse?.microformat?.playerMicroformatRenderer?.audioLanguage ||
    playerResponse?.microformat?.playerMicroformatRenderer?.defaultAudioLanguage;

  return {
    title,
    description,
    descriptionSource,
    originalLanguage: detectedOriginalLanguage,
    captionTracks,
    hasPlayerResponse: Boolean(playerResponse),
    hasInitialData: Boolean(initialData),
  };
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

  let transcript = "";
  const metadata = extractYouTubeMetadata(html);

  try {
    transcript = await fetchYouTubeCaptions(metadata.captionTracks, metadata.originalLanguage, videoId);
  } catch (e) {
    console.log("Could not extract YouTube captions:", videoId, e instanceof Error ? e.message : e);
  }

  console.log("YouTube extraction summary:", videoId, {
    playerResponse: metadata.hasPlayerResponse,
    initialData: metadata.hasInitialData,
    titleLength: metadata.title.length,
    descriptionLength: metadata.description.length,
    descriptionSource: metadata.descriptionSource,
    captionTracks: metadata.captionTracks.length,
    transcriptLength: transcript.length,
  });

  // Be more lenient - allow if we have at least a description with some content
  if (!transcript && metadata.description.length < 50) {
    throw new Error("NO_CONTENT");
  }

  const parts = [`Название видео: ${metadata.title}`];
  if (metadata.description) parts.push(`Описание видео: ${metadata.description}`);
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
      // Reject YouTube non-video URLs (search, channel, playlist pages)
      if (/youtube\.com\/(results|channel|c\/|user\/|playlist|feed|@)/i.test(url)) {
        return new Response(
          JSON.stringify({ error: "Пожалуйста, вставьте ссылку на конкретное видео, а не на страницу поиска или канала YouTube." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        console.log("Detected YouTube video:", videoId);
        pageContent = await fetchYouTubeContent(videoId);
      } else if (extractTikTokUrl(url)) {
        throw new Error("NO_CONTENT");
      } else {
        pageContent = await fetchPageContent(url);
      }
    } catch (fetchError: any) {
      if (fetchError?.message === "NO_CONTENT") {
        return new Response(
          JSON.stringify({
            error: "Не удалось получить данные из источника. Нет субтитров, описания или текста на странице.",
            code: "VIDEO_TEXT_INSUFFICIENT",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("Error fetching URL:", fetchError);
        return new Response(
          JSON.stringify({
            error: "Не удалось загрузить страницу. Проверьте ссылку и попробуйте снова.",
            code: "SOURCE_FETCH_FAILED",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log("Sending to AI, content length:", pageContent.length);

    let parsed: Record<string, unknown>;
    try {
      parsed = await parseRecipeText({
        apiKey: LOVABLE_API_KEY,
        text: pageContent,
        context: { sourceUrl: url },
      });
    } catch (error) {
      if (error instanceof RecipeParserError) {
        return new Response(
          JSON.stringify({ error: error.message, code: error.code }),
          { status: error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
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
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестная ошибка", code: "IMPORT_RECIPE_URL_FAILED" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
