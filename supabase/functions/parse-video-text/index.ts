import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseRecipeText, RecipeParserError } from "../_shared/recipe-parser.ts";
import { detectPlatform, extractYouTubeVideoId, getYouTubeThumbnail } from "../_shared/source-metadata.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_TEXT_LENGTH = 60000;
const allowedPlatforms = new Set(["youtube", "tiktok", "instagram", "vk", "video", "unknown"]);

type ParseVideoTextRequest = {
  text?: unknown;
  sourceUrl?: unknown;
  sourcePlatform?: unknown;
  detectedLanguage?: unknown;
  languageProbability?: unknown;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeSourcePlatform(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  return allowedPlatforms.has(normalized) ? normalized : "unknown";
}

function normalizeOptionalLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (!normalized || normalized.length > 24 || !/^[a-z-]+$/.test(normalized)) return undefined;
  return normalized;
}

function normalizeLanguageProbability(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 1) return undefined;
  return value;
}

function normalizeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: ParseVideoTextRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body", code: "INVALID_JSON" }, 400);
    }

    if (typeof body.text !== "string") {
      return jsonResponse({ error: "text must be a string", code: "INVALID_TEXT" }, 400);
    }

    const text = body.text.trim();
    if (!text) {
      return jsonResponse({ error: "text is required", code: "EMPTY_TEXT" }, 400);
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return jsonResponse({ error: `text is too long. Maximum length is ${MAX_TEXT_LENGTH} characters`, code: "TEXT_TOO_LONG" }, 413);
    }

    const rawSourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl : undefined;
    const sourceUrl = normalizeSourceUrl(rawSourceUrl);
    if (rawSourceUrl && !sourceUrl) {
      return jsonResponse({ error: "sourceUrl must be a valid http(s) URL", code: "INVALID_SOURCE_URL" }, 400);
    }

    const providedPlatform = normalizeSourcePlatform(body.sourcePlatform);
    const sourcePlatform = providedPlatform !== "unknown" || !sourceUrl ? providedPlatform : detectPlatform(sourceUrl);
    const detectedLanguage = normalizeOptionalLanguage(body.detectedLanguage);
    const languageProbability = normalizeLanguageProbability(body.languageProbability);

    console.log("parse-video-text request:", {
      textLength: text.length,
      sourcePlatform,
      hasSourceUrl: Boolean(sourceUrl),
      detectedLanguage: detectedLanguage || "unknown",
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let parsed: Record<string, unknown>;
    try {
      parsed = await parseRecipeText({
        apiKey: LOVABLE_API_KEY,
        text,
        context: {
          sourceType: "video",
          sourcePlatform,
          sourceUrl,
          detectedLanguage,
        },
      });
    } catch (error) {
      if (error instanceof RecipeParserError) {
        return jsonResponse({ error: error.message, code: error.code }, error.status);
      }
      throw error;
    }

    parsed.source = {
      sourceType: "video",
      sourceUrl: sourceUrl || "",
      sourcePlatform,
    };

    if (sourceUrl) {
      const videoId = extractYouTubeVideoId(sourceUrl);
      if (videoId) {
        parsed.thumbnail = getYouTubeThumbnail(videoId);
      }
    }

    parsed.transcript_metadata = {
      textSource: "transcript",
      detectedLanguage: detectedLanguage || null,
      languageProbability: languageProbability ?? null,
    };

    return jsonResponse(parsed);
  } catch (e) {
    console.error("parse-video-text error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Неизвестная ошибка", code: "PARSE_VIDEO_TEXT_FAILED" }, 500);
  }
});
