import { useState, useRef, useEffect } from "react";
import { X, Link2, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";
import { useCreateRecipe } from "@/hooks/useRecipes";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

type Stage = "idle" | "fetching" | "analyzing" | "formatting" | "transcribing" | "preparing_local_model" | "parsing_transcript" | "done" | "error";

type LocalQualityScore = "high" | "medium" | "low";

interface LocalQualityWarning {
  code: string;
}

interface LocalRecipeQuality {
  score: LocalQualityScore;
  needs_review: boolean;
  warnings: LocalQualityWarning[];
}

interface ParsedRecipe {
  title: string; description: string; ingredients: string[]; instructions: string[];
  cooking_time: string; servings: number | null; difficulty: string; tags: string[];
  notes: string; category_hint: string;
  source?: { sourceType: string; sourceUrl: string; sourcePlatform: string; };
  thumbnail?: string;
  localDraft?: boolean;
  quality?: LocalRecipeQuality;
}

interface URLImportModalProps { open: boolean; onClose: () => void; }

interface FunctionErrorPayload {
  error?: string;
  code?: string;
}

class ImportFlowError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ImportFlowError";
    this.code = code;
    this.status = status;
  }
}

interface TranscriptCache {
  url: string;
  text: string;
  language?: string | null;
  languageProbability?: number | null;
}

interface VideoTextPayload {
  platform?: string;
  title?: string;
  description?: string;
  transcript?: string;
  transcriptSource?: string;
  ocrText?: string;
  language?: string | null;
  duration?: number | null;
}

const VIDEO_FALLBACK_CODES = new Set(["VIDEO_TEXT_INSUFFICIENT", "RECIPE_TEXT_INSUFFICIENT"]);
const LEGACY_YOUTUBE_INSUFFICIENT_SOURCE_PATTERNS = [
  /РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РґР°РЅРЅС‹Рµ РёР· РёСЃС‚РѕС‡РЅРёРєР°/i,
  /РќРµС‚ СЃСѓР±С‚РёС‚СЂРѕРІ,\s*РѕРїРёСЃР°РЅРёСЏ РёР»Рё С‚РµРєСЃС‚Р°/i,
];

function isYouTubeUrl(value: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}/i.test(value);
}

function normalizeSourceUrl(value: string): string {
  return value.trim().replace(/[.,;:!?)]*$/u, "");
}

function isVideoUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return (
      isYouTubeUrl(value) ||
      /\.(?:mp4|m4v|mov|webm|mkv)(?:$|[?#])/i.test(value) ||
      /\/(?:video|videos|reel|reels|shorts|clip|watch)\b/i.test(path) ||
      host.endsWith("ok.ru") ||
      host.endsWith("instagram.com") ||
      host.endsWith("tiktok.com") ||
      host.endsWith("vimeo.com") ||
      host.endsWith("dailymotion.com") ||
      host.endsWith("rutube.ru") ||
      host.endsWith("vkvideo.ru")
    );
  } catch {
    return false;
  }
}

function getSourcePlatform(value: string, extractedPlatform?: string): string {
  if (extractedPlatform?.trim()) return extractedPlatform.trim().toLowerCase();
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
    if (host.endsWith("ok.ru")) return "ok";
    if (host.endsWith("instagram.com")) return "instagram";
    if (host.endsWith("tiktok.com")) return "tiktok";
    return host.split(".")[0] || "video";
  } catch {
    return "video";
  }
}

function normalizeImportError(error: ImportFlowError, importUrl: string): ImportFlowError {
  if (error.code || error.status !== 422 || !isYouTubeUrl(importUrl)) {
    return error;
  }

  const isLegacyInsufficientSource = LEGACY_YOUTUBE_INSUFFICIENT_SOURCE_PATTERNS.some((pattern) =>
    pattern.test(error.message || "")
  );

  return isLegacyInsufficientSource
    ? new ImportFlowError(error.message, "VIDEO_TEXT_INSUFFICIENT", error.status)
    : error;
}

function isTranscriptUsable(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  const alphanumeric = compact.replace(/[^\p{L}\p{N}]/gu, "");
  return compact.length >= 80 && alphanumeric.length >= 40;
}

function getRecipeTextSignalScore(text: string): number {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const quantityUnitMatches = text.match(/\d+(?:[.,]\d+)?\s*(?:Рі|РіСЂ|РєРі|РјР»|Р»|СЃС‚\.?\s*Р»|С‡\.?\s*Р»|С€С‚|Р·СѓР±С‡РёРє|РїСѓС‡РѕРє|РјРёРЅСѓС‚|В°)/giu) || [];
  const ingredientLikeLines = lines.filter((line) =>
    /(?:^[-*вЂўв–Є]?\s*)?[\p{L}\s"'().-]{2,50}\s*[-вЂ“:]\s*(?:\d|РїРѕ РІРєСѓСЃСѓ)/iu.test(line)
  );
  const hasIngredientHeading = /(?:^|\n)\s*(?:СЂРµС†РµРїС‚|РёРЅРіСЂРµРґРёРµРЅС‚С‹|СЃРѕСЃС‚Р°РІ)\s*:/iu.test(text);
  const hasCookingActions = /(?:РЅР°СЂРµР¶|РІР°СЂ|Р¶Р°СЂ|С‚СѓС€|Р·Р°РїРµРєР°|СЃРјРµС€Р°|РґРѕР±Р°РІ|РїРѕСЃРѕР»|РїРѕРїРµСЂС‡|РіРѕС‚РѕРІ|РєРёРїСЏС‚|РјР°СЃР»Рѕ|РІРѕРґР°|РєР°СЃС‚СЂСЋР»)/iu.test(text);
  const hasFoodWords = /(?:РєР°СЂС‚РѕС„|СЃРІ[РµС‘]РєР»|Р»СѓРє|РјРѕСЂРєРѕРІ|РєР°РїСѓСЃС‚|С‚РѕРјР°С‚|С„Р°СЃРѕР»|СЃРѕР»СЊ|РїРµСЂРµС†|РїР°РїСЂРёРє|РјР°СЃР»Рѕ|Р»Р°РІСЂРѕРІ|РјСѓРєР°|СЃР°С…Р°СЂ|РјРѕР»РѕРєРѕ|СЏР№С†)/iu.test(text);

  return [
    quantityUnitMatches.length >= 3,
    ingredientLikeLines.length >= 3,
    hasIngredientHeading,
    hasCookingActions,
    hasFoodWords,
  ].filter(Boolean).length;
}

function hasUsefulRecipeText(text: string): boolean {
  return getRecipeTextSignalScore(text) >= 2;
}

function buildVideoRecipeText(data: VideoTextPayload): string {
  const sections: string[] = [];
  if (data.title?.trim()) sections.push(`TITLE:\n${data.title.trim()}`);
  if (data.description?.trim()) sections.push(`VIDEO DESCRIPTION:\n${data.description.trim()}`);
  if (data.transcript?.trim()) sections.push(`VIDEO TRANSCRIPT:\n${data.transcript.trim().slice(0, 45000)}`);
  if (data.ocrText?.trim()) sections.push(`VIDEO OCR TEXT:\n${data.ocrText.trim().slice(0, 45000)}`);
  return sections.join("\n\n");
}

export function URLImportModal({ open, onClose }: URLImportModalProps) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    title: "", description: "", ingredients: "", instructions: "",
    cooking_time: "", servings: 4, difficulty: "", tags: "", notes: "", category: "",
  });

  // рџ‘‡ РќРћР’Р«Р• РЎРћРЎРўРћРЇРќРРЇ Р”Р›РЇ Р Р•Р–РРњРђ "РЎРћРҐР РђРќРРўР¬ РљРђРљ РЎРЎР«Р›РљРЈ"
  const [saveAsLinkMode, setSaveAsLinkMode] = useState(false);
  const [manualLink, setManualLink] = useState({
    title: "",
    description: "",
    category: "",
  });
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const transcriptCacheRef = useRef<TranscriptCache | null>(null);
  const { data: categories } = useCategories();
  const createRecipe = useCreateRecipe();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const STAGE_LABELS: Record<Stage, string> = {
    idle: "", fetching: t("fetching_text"), analyzing: t("analyzing_content"),
    formatting: t("formatting_recipe"), transcribing: t("transcribing_video"),
    preparing_local_model: t("preparing_local_recipe_model"),
    parsing_transcript: t("creating_recipe_from_transcript"), done: t("done"), error: t("error"),
  };

  const setImportedRecipe = (data: ParsedRecipe) => {
    setParsed(data);
    setEditData({
      title: data.title || "", description: data.description || "",
      ingredients: (data.ingredients || []).join("\n"), instructions: (data.instructions || []).join("\n"),
      cooking_time: data.cooking_time || "", servings: data.servings || 4,
      difficulty: data.difficulty || "medium", tags: (data.tags || []).join(", "),
      notes: data.notes || "", category: "",
    });
    setStage("done");
  };

  const parseFunctionError = async (resp: Response, fallbackMessage: string): Promise<ImportFlowError> => {
    const payload: FunctionErrorPayload = await resp.json().catch(() => ({}));
    return new ImportFlowError(payload.error || fallbackMessage, payload.code, resp.status);
  };

  const invokeRecipeFunction = async (name: string, body: unknown): Promise<ParsedRecipe> => {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw await parseFunctionError(resp, `${t("error")}: ${resp.status}`);
    }
    return await resp.json();
  };

  const getTranscriptionErrorMessage = (code?: string, message?: string): string => {
    const keyByCode: Record<string, string> = {
      HELPER_NOT_FOUND: "transcription_error_helper_missing",
      HELPER_START_FAILED: "transcription_error_helper_start",
      MODEL_DOWNLOAD_FAILED: "transcription_error_model_download",
      MODEL_LOAD_FAILED: "transcription_error_model_load",
      DOWNLOAD_FAILED: "transcription_error_video_download",
      HELPER_TIMEOUT: "transcription_error_timeout",
      TRANSCRIPTION_FAILED: "transcription_error_failed",
    };
    const key = code ? keyByCode[code] : undefined;
    return key ? t(key) : (message || t("transcription_error_failed"));
  };

  const getLocalParserErrorMessage = (code?: string, message?: string): string => {
    const keyByCode: Record<string, string> = {
      LLM_RUNTIME_NOT_FOUND: "local_recipe_error_runtime_missing",
      LLM_RUNTIME_START_FAILED: "local_recipe_error_runtime_start",
      RECIPE_MODEL_NOT_FOUND: "local_recipe_error_model_missing",
      RECIPE_MODEL_DOWNLOAD_FAILED: "local_recipe_error_model_download",
      RECIPE_MODEL_LOAD_FAILED: "local_recipe_error_model_load",
      RECIPE_PARSE_TIMEOUT: "local_recipe_error_timeout",
      RECIPE_TEXT_INSUFFICIENT: "local_recipe_error_insufficient",
      NOT_A_COOKING_RECIPE: "local_recipe_error_not_cooking_recipe",
      NOT_A_RECIPE: "local_recipe_error_not_recipe",
      RECIPE_PARSE_FAILED: "local_recipe_error_failed",
    };
    const key = code ? keyByCode[code] : undefined;
    return key ? t(key) : (message || t("local_recipe_error_failed"));
  };

  const getYouTubeVideoId = (videoUrl: string): string | null => {
    try {
      const parsedUrl = new URL(videoUrl);
      const host = parsedUrl.hostname.replace(/^www\./, "");
      if (host === "youtu.be") return parsedUrl.pathname.split("/").filter(Boolean)[0] || null;
      if (host.endsWith("youtube.com")) {
        if (parsedUrl.pathname === "/watch") return parsedUrl.searchParams.get("v");
        const match = parsedUrl.pathname.match(/\/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})/);
        return match?.[1] || null;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const getYouTubeThumbnail = (videoUrl: string): string => {
    const videoId = getYouTubeVideoId(videoUrl);
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
  };

  const normalizeRecipeTitle = (value: string): string =>
    value.replace(/\s+/g, " ").trim().toLocaleLowerCase();

  const confirmNoTitleDuplicate = async (title: string): Promise<boolean> => {
    const normalizedTitle = normalizeRecipeTitle(title);
    if (!normalizedTitle) return true;

    try {
      const { data, error } = await supabase.from("recipes").select("id,title").limit(1000);
      if (error) {
        console.warn("Duplicate title check failed:", error);
        return true;
      }

      const duplicate = (data || []).find((recipe) => normalizeRecipeTitle(recipe.title || "") === normalizedTitle);
      if (!duplicate) return true;

      return window.confirm(t("duplicate_recipe_title_confirm", { title: duplicate.title || title }));
    } catch (error) {
      console.warn("Duplicate title check failed:", error);
      return true;
    }
  };


  const getQualityWarningMessages = (quality?: LocalRecipeQuality): string[] => {
    if (!quality?.needs_review) return [];
    const codes = new Set((quality.warnings || []).map((warning) => warning.code));
    const messages: string[] = [];
    if (quality.score === "low") messages.push(t("local_recipe_quality_low"));
    else if (quality.score === "medium") messages.push(t("local_recipe_quality_medium"));
    else messages.push(t("local_recipe_quality_high"));
    if (codes.has("NEGATION_CONFLICT")) messages.push(t("local_recipe_warning_negation"));
    if (codes.has("UNSUPPORTED_QUANTITY")) messages.push(t("local_recipe_warning_quantity"));
    if (codes.has("UNSUPPORTED_INGREDIENT")) messages.push(t("local_recipe_warning_ingredient"));
    if (codes.has("POSSIBLE_MISSING_INGREDIENT")) messages.push(t("local_recipe_warning_missing_ingredient"));
    return messages;
  };

  const parseLocalVideoRecipe = async (text: string, sourceLanguage?: string | null) => {
    setStage("parsing_transcript");
    let localParseResult = await window.tasteTrace!.parseRecipeTextLocal({
      text,
      sourceLanguage: sourceLanguage || undefined,
    });

    if (!localParseResult.success && localParseResult.error?.code === "RECIPE_MODEL_NOT_FOUND") {
      const shouldDownload = window.confirm(t("local_recipe_model_download_confirm"));
      if (!shouldDownload) {
        throw new ImportFlowError(t("local_recipe_error_model_missing"), "RECIPE_MODEL_NOT_FOUND");
      }
      if (typeof window.tasteTrace?.prepareRecipeParserModel !== "function") {
        throw new ImportFlowError(t("local_recipe_error_model_missing"), "RECIPE_MODEL_NOT_FOUND");
      }
      setStage("preparing_local_model");
      const prepareResult = await window.tasteTrace.prepareRecipeParserModel();
      if (!prepareResult.success) {
        throw new ImportFlowError(
          getLocalParserErrorMessage(prepareResult.error?.code, prepareResult.error?.message),
          prepareResult.error?.code,
        );
      }
      setStage("parsing_transcript");
      localParseResult = await window.tasteTrace!.parseRecipeTextLocal({
        text,
        sourceLanguage: sourceLanguage || undefined,
      });
    }

    if (!localParseResult.success || !localParseResult.recipe) {
      throw new ImportFlowError(
        getLocalParserErrorMessage(localParseResult.error?.code, localParseResult.error?.message),
        localParseResult.error?.code,
      );
    }

    return localParseResult;
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
  
// рџ‘‡ РќРћР’РђРЇ Р¤РЈРќРљР¦РРЇ: РџРѕР»СѓС‡РµРЅРёРµ РѕР±Р»РѕР¶РєРё РґР»СЏ СЃСЃС‹Р»РєРё
  const getThumbnailFromUrl = async (videoUrl: string): Promise<string> => {
    try {
      // 1. YouTube (СЃР°РјС‹Р№ РЅР°РґС‘Р¶РЅС‹Р№ РІР°СЂРёР°РЅС‚)
      const youtubeMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (youtubeMatch && youtubeMatch[1]) {
        const videoId = youtubeMatch[1];
        // РџСЂРѕРІРµСЂСЏРµРј РЅР°Р»РёС‡РёРµ РѕР±Р»РѕР¶РєРё РІ РІС‹СЃРѕРєРѕРј РєР°С‡РµСЃС‚РІРµ
        const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        const hqUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        
        // РџСЂРѕРІРµСЂСЏРµРј, СЃСѓС‰РµСЃС‚РІСѓРµС‚ Р»Рё maxresdefault (РЅРµ 404)
        const response = await fetch(maxResUrl, { method: 'HEAD' });
        if (response.ok && response.status === 200) {
          return maxResUrl;
        }
        return hqUrl; // Р’РѕР·РІСЂР°С‰Р°РµРј HQ, РµСЃР»Рё MaxRes РЅРµС‚
      }

      // 2. Р”Р»СЏ РѕСЃС‚Р°Р»СЊРЅС‹С… СЃР°Р№С‚РѕРІ РїСЂРѕР±СѓРµРј РїРѕР»СѓС‡РёС‚СЊ С‡РµСЂРµР· noembed РёР»Рё Р·Р°РіР»СѓС€РєСѓ
      // РњРѕР¶РЅРѕ СЂР°СЃС€РёСЂРёС‚СЊ РґР»СЏ TikTok, Vimeo Рё РґСЂ.
      
    } catch (err) {
      console.error("Thumbnail fetch error:", err);
    }
    // Р•СЃР»Рё РЅРёС‡РµРіРѕ РЅРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ вЂ” РІРѕР·РІСЂР°С‰Р°РµРј РїСѓСЃС‚СѓСЋ СЃС‚СЂРѕРєСѓ (Р±СѓРґРµС‚ Р·Р°РіР»СѓС€РєР° РїСЂРёР»РѕР¶РµРЅРёСЏ)
    return "";
  };  

  const extractVideoThumbnailFallback = async (sourceUrl?: string | null): Promise<string> => {
    if (!sourceUrl || !isVideoUrl(sourceUrl)) return "";
    if (
      typeof window === "undefined" ||
      typeof window.tasteTrace?.extractVideoThumbnail !== "function"
    ) {
      return "";
    }

    try {
      const result = await window.tasteTrace.extractVideoThumbnail({ url: sourceUrl });
      if (result.success && typeof result.imageDataUrl === "string" && result.imageDataUrl.startsWith("data:image/")) {
        console.log("Video thumbnail frame fallback selected:", {
          platform: result.platform || "unknown",
          timestamp: result.timestamp,
          strategy: result.strategy,
          seconds: result.total_seconds,
        });
        return result.imageDataUrl;
      }
      console.warn("Video thumbnail frame fallback unavailable:", {
        code: result.error?.code || "unknown",
        message: result.error?.message || "No thumbnail frame returned.",
      });
    } catch (error) {
      console.warn("Video thumbnail frame fallback failed:", error);
    }
    return "";
  };

  const resolveRecipeImage = async (sourceUrl?: string | null, preferredThumbnail?: string | null): Promise<string> => {
    const platformThumbnail =
      preferredThumbnail ||
      (sourceUrl && isYouTubeUrl(sourceUrl) ? getYouTubeThumbnail(sourceUrl) : "");
    if (sourceUrl && isVideoUrl(sourceUrl) && !isYouTubeUrl(sourceUrl)) {
      const frameThumbnail = await extractVideoThumbnailFallback(sourceUrl);
      if (frameThumbnail) return frameThumbnail;
    }
    if (platformThumbnail) return platformThumbnail;
    return await extractVideoThumbnailFallback(sourceUrl);
  };

// рџ‘‡ РћР‘РќРћР’Р›РЃРќРќРђРЇ Р¤РЈРќРљР¦РРЇ handleSaveAsLink

  const handleSaveAsLink = async () => {
    if (isSavingRecipe) return;
    if (!manualLink.title.trim() || !manualLink.category) {
      toast.error(t("please_fill_required") || "Р—Р°РїРѕР»РЅРёС‚Рµ РЅР°Р·РІР°РЅРёРµ Рё РІС‹Р±РµСЂРёС‚Рµ РєР°С‚РµРіРѕСЂРёСЋ");
      return;
    }
    
    try {
      setIsSavingRecipe(true);
      // 1. РЎРЅР°С‡Р°Р»Р° РїС‹С‚Р°РµРјСЃСЏ РїРѕР»СѓС‡РёС‚СЊ РѕР±Р»РѕР¶РєСѓ
      const thumbnail = await resolveRecipeImage(url, await getThumbnailFromUrl(url));
      
      // 2. Р¤РѕСЂРјРёСЂСѓРµРј РґР°РЅРЅС‹Рµ
      const recipeData = {
        title: manualLink.title.trim(),
        description: manualLink.description.trim() || `рџ”— ${url}`,
        ingredients: ["вЂ”"],                    // Р—Р°РіР»СѓС€РєР° РґР»СЏ РІР°Р»РёРґР°С†РёРё Р‘Р”
        instructions: ["РЎСЃС‹Р»РєР° РЅР° РІРЅРµС€РЅРёР№ СЂРµСЃСѓСЂСЃ"], // Р—Р°РіР»СѓС€РєР° РґР»СЏ РІР°Р»РёРґР°С†РёРё Р‘Р”
        cooking_time: "",
        servings: 1,
        difficulty: "medium",
        tags: ["СЃСЃС‹Р»РєР°", "РІРёРґРµРѕ", "СЂР°Р·РЅРѕРµ"].map(tag => tag.trim()).filter(Boolean),
        notes: `рџ”— РСЃС‚РѕС‡РЅРёРє: ${url}`,
        category: manualLink.category,
        image: thumbnail,                      // вњ… РћР±Р»РѕР¶РєР° РІРёРґРµРѕ
        source: {
          sourceType: "link",
          sourceUrl: url,
          sourcePlatform: url.includes("youtube") ? "youtube" : 
                        url.includes("tiktok") ? "tiktok" : "web",
        },
      };

      console.log("Saving link recipe:", recipeData);

      if (!(await confirmNoTitleDuplicate(recipeData.title))) return;
      
      await createRecipe.mutateAsync(recipeData as any);
      
      onClose();
      navigate("/");
      toast.success(t("link_saved") || "РЎСЃС‹Р»РєР° СЃРѕС…СЂР°РЅРµРЅР°");
    } catch (err) {
      console.error("вќЊ Save link error:", err);
      toast.error(t("error_saving_recipe") || "РћС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё");
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const handleImport = async () => {
    const importUrl = normalizeSourceUrl(url);
    if (!importUrl) return;
    setStage("fetching"); setErrorMsg(""); setParsed(null);
    // РЎР±СЂР°СЃС‹РІР°РµРј СЂРµР¶РёРј СЃРѕС…СЂР°РЅРµРЅРёСЏ СЃСЃС‹Р»РєРё РїСЂРё РЅРѕРІРѕРј РёРјРїРѕСЂС‚Рµ
    setSaveAsLinkMode(false);

    const localVideoTextApiAvailable =
      typeof window !== "undefined" &&
      typeof window.tasteTrace?.importVideoRecipeLocal === "function" &&
      typeof window.tasteTrace?.parseRecipeTextLocal === "function";

    if (isVideoUrl(importUrl) && localVideoTextApiAvailable) {
      try {
        console.log("Starting local staged video recipe pipeline:", { url: importUrl });
        const pipelineResult = await window.tasteTrace!.importVideoRecipeLocal({ url: importUrl });
        console.log("Local staged video recipe pipeline result:", {
          success: pipelineResult.success,
          stage: pipelineResult.stage || "none",
          code: pipelineResult.error?.code || "none",
          stagesRun: pipelineResult.evidence?.diagnostics?.stagesRun || pipelineResult.details?.evidence?.diagnostics?.stagesRun || [],
          stagesSkipped: pipelineResult.evidence?.diagnostics?.stagesSkipped || pipelineResult.details?.evidence?.diagnostics?.stagesSkipped || [],
        });

        if (pipelineResult.success && pipelineResult.recipe) {
          const localRecipe = pipelineResult.recipe as ParsedRecipe;
          setImportedRecipe({
            ...localRecipe,
            thumbnail: localRecipe.thumbnail || (isYouTubeUrl(importUrl) ? getYouTubeThumbnail(importUrl) : ""),
          });
          return;
        }

        if (pipelineResult.error?.code === "RECIPE_MODEL_NOT_FOUND" && pipelineResult.details?.parserInput) {
          try {
            const localParseResult = await parseLocalVideoRecipe(
              pipelineResult.details.parserInput,
              pipelineResult.details.evidence?.language,
            );
            const parsedRecipe: ParsedRecipe = {
              ...localParseResult.recipe!,
              servings: localParseResult.recipe!.servings,
              source: {
                sourceType: "video",
                sourceUrl: importUrl,
                sourcePlatform: getSourcePlatform(importUrl, pipelineResult.details.evidence?.platform),
              },
              thumbnail: isYouTubeUrl(importUrl) ? getYouTubeThumbnail(importUrl) : "",
              localDraft: true,
              quality: localParseResult.quality,
            };
            console.log("Local staged video parser retry succeeded:", {
              platform: pipelineResult.details.evidence?.platform || getSourcePlatform(importUrl),
              quality: localParseResult.quality?.score || "unknown",
              needsReview: localParseResult.quality?.needs_review || false,
            });
            setImportedRecipe(parsedRecipe);
            return;
          } catch (localParseError) {
            setStage("error");
            setErrorMsg(localParseError instanceof Error ? localParseError.message : t("error"));
            return;
          }
        }

        if (pipelineResult.error?.code && pipelineResult.error.code !== "RECIPE_TEXT_INSUFFICIENT") {
          setStage("error");
          setErrorMsg(getLocalParserErrorMessage(pipelineResult.error.code, pipelineResult.error.message));
          return;
        }
      } catch (videoTextError) {
        console.log("Local staged video recipe pipeline failed; falling back to cloud import:", {
          code: videoTextError instanceof ImportFlowError ? videoTextError.code : "unknown",
        });
      }
    }
    
    let completed = false;
    const t1 = setTimeout(() => { if (!completed) setStage("analyzing"); }, 1500);
    const t2 = setTimeout(() => { if (!completed) setStage("formatting"); }, 4000);
    try {
      const data = await invokeRecipeFunction("import-recipe-url", { url: importUrl });
      completed = true; clearTimeout(t1); clearTimeout(t2);
      console.log("URL import succeeded:", { isVideo: isVideoUrl(importUrl), platform: getSourcePlatform(importUrl) });
      setImportedRecipe(data);
    } catch (e) {
      completed = true; clearTimeout(t1); clearTimeout(t2);
      const rawImportError = e instanceof ImportFlowError ? e : new ImportFlowError(e instanceof Error ? e.message : t("error"));
      const importError = normalizeImportError(rawImportError, importUrl);
      const canFallback = isVideoUrl(importUrl) && !!importError.code && VIDEO_FALLBACK_CODES.has(importError.code);
      const electronApiAvailable =
        typeof window !== "undefined" &&
        (typeof window.tasteTrace?.transcribeVideo === "function" || typeof window.tasteTrace?.transcribeYouTube === "function") &&
        typeof window.tasteTrace?.parseRecipeTextLocal === "function";

      console.log("URL import failed:", {
        isVideo: isVideoUrl(importUrl),
        platform: getSourcePlatform(importUrl),
        code: importError.code || "unknown",
        canFallback,
        electronApiAvailable,
      });

      if (!canFallback || !electronApiAvailable) {
        setStage("error"); setErrorMsg(importError.message);
        return;
      }

      try {
        console.log("Starting generic video transcription fallback:", { reason: importError.code, platform: getSourcePlatform(importUrl) });
        let transcript = transcriptCacheRef.current?.url === importUrl ? transcriptCacheRef.current : null;

        if (!transcript) {
          setStage("transcribing");
          const transcribeVideo = window.tasteTrace!.transcribeVideo || window.tasteTrace!.transcribeYouTube;
          const transcriptionResult = await transcribeVideo({ url: importUrl });
          if (!transcriptionResult.success) {
            throw new ImportFlowError(
              getTranscriptionErrorMessage(transcriptionResult.error?.code, transcriptionResult.error?.message),
              transcriptionResult.error?.code,
            );
          }
          const text = transcriptionResult.text || "";
          console.log("Transcription fallback result:", {
            success: true,
            transcriptLength: text.length,
            detectedLanguage: transcriptionResult.language || "unknown",
          });
          if (!isTranscriptUsable(text)) {
            throw new ImportFlowError(t("transcription_error_too_short"), "TRANSCRIPT_TOO_SHORT");
          }
          transcript = {
            url: importUrl,
            text,
            language: transcriptionResult.language,
            languageProbability: transcriptionResult.language_probability,
          };
          transcriptCacheRef.current = transcript;
        } else {
          console.log("Reusing cached transcript for parser retry:", { transcriptLength: transcript.text.length });
        }

        const localParseResult = await parseLocalVideoRecipe(transcript.text, transcript.language);

        const parsedRecipe: ParsedRecipe = {
          ...localParseResult.recipe,
          servings: localParseResult.recipe.servings,
            source: {
              sourceType: "video",
              sourceUrl: importUrl,
              sourcePlatform: getSourcePlatform(importUrl),
            },
          thumbnail: isYouTubeUrl(importUrl) ? getYouTubeThumbnail(importUrl) : "",
          localDraft: true,
          quality: localParseResult.quality,
        };
        console.log("Local video recipe parser succeeded:", {
          quality: localParseResult.quality?.score || "unknown",
          needsReview: localParseResult.quality?.needs_review || false,
        });
        setImportedRecipe(parsedRecipe);
      } catch (fallbackError) {
        console.log("Generic video transcription fallback failed:", {
          code: fallbackError instanceof ImportFlowError ? fallbackError.code : "unknown",
        });
        setStage("error");
        setErrorMsg(fallbackError instanceof Error ? fallbackError.message : t("error"));
      }
    }
  };

  const handleSave = async () => {
    if (isSavingRecipe) return;
    const data = editMode ? editData : {
      title: parsed!.title, description: parsed!.description,
      ingredients: (parsed!.ingredients || []).join("\n"), instructions: (parsed!.instructions || []).join("\n"),
      cooking_time: parsed!.cooking_time, servings: parsed!.servings,
      difficulty: parsed!.difficulty, tags: (parsed!.tags || []).join(", "),
      notes: parsed!.notes, category: editData.category,
    };
    if (!data.category) { toast.error(t("please_select_category")); return; }
    try {
      setIsSavingRecipe(true);
      if (!(await confirmNoTitleDuplicate(data.title))) return;

      const sourceData = parsed?.source;
      let finalNotes = data.notes || "";
      if (sourceData?.sourceUrl) {
        const urlLine = `\n${t("source")}: ${sourceData.sourceUrl}`;
        if (!finalNotes.includes(sourceData.sourceUrl)) {
          finalNotes = finalNotes ? finalNotes.trimEnd() + "\n" + urlLine : urlLine.trim();
        }
      }
      const recipeImage = await resolveRecipeImage(sourceData?.sourceUrl, parsed?.thumbnail);
      await createRecipe.mutateAsync({
        title: data.title, description: data.description,
        ingredients: data.ingredients.split("\n").filter(Boolean),
        instructions: data.instructions.split("\n").filter(Boolean),
        cooking_time: data.cooking_time, servings: data.servings,
        difficulty: data.difficulty,
        tags: data.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: finalNotes, category: data.category,
        image: recipeImage,
        screenshots: recipeImage ? [recipeImage] : [],
        source: sourceData || null,
      } as any);
      onClose(); navigate("/");
    } catch { toast.error(t("error_saving_recipe")); }
    finally { setIsSavingRecipe(false); }
  };

  const reset = () => { 
    setUrl(""); 
    setStage("idle"); 
    setParsed(null); 
    setEditMode(false); 
    setErrorMsg("");
    setSaveAsLinkMode(false);
    setIsSavingRecipe(false);
    transcriptCacheRef.current = null;
    setManualLink({ title: "", description: "", category: "" });
  };

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="relative w-full max-w-2xl mx-4 rounded-xl border bg-card text-card-foreground shadow-xl animate-scale-in flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">{t("import_recipe")}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {stage === "idle" || stage === "error" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("paste_link")}</p>
              <div className="flex gap-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="flex-1" />
                <Button onClick={handleImport} disabled={!url.trim()}>{t("process")}</Button>
              </div>
              {stage === "error" && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{errorMsg}</span>
                  </div>
                  
                  {!saveAsLinkMode ? (
                    <Button variant="outline" size="sm" onClick={() => {
                      setSaveAsLinkMode(true);
                      setManualLink({ title: "", description: "", category: "" });
                      // РџРѕРїС‹С‚РєР° Р°РІС‚РѕР·Р°РїРѕР»РЅРµРЅРёСЏ РЅР°Р·РІР°РЅРёСЏ РёР· РѕС€РёР±РєРё РёР»Рё РґРѕРјРµРЅР°
                      const domainMatch = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
                      if (domainMatch) {
                        setManualLink(prev => ({ ...prev, title: domainMatch[1] }));
                      }
                    }} className="w-full">
                      рџ’ѕ {t("save_as_link") || "РЎРѕС…СЂР°РЅРёС‚СЊ РєР°Рє СЃСЃС‹Р»РєСѓ"}
                    </Button>
                  ) : (
                    <div className="space-y-3 p-3 rounded-lg bg-accent/30 border animate-in fade-in slide-in-from-top-2">
                      <div>
                        <Label className="text-xs">{t("manual_link_title") || "РќР°Р·РІР°РЅРёРµ *"}</Label>
                        <Input 
                          value={manualLink.title} 
                          onChange={(e) => setManualLink({ ...manualLink, title: e.target.value })}
                          placeholder={t("enter_title") || "РќР°РїСЂРёРјРµСЂ: РљР°Рє Р·Р°РјРµРЅРёС‚СЊ Р±С‹С‚РѕРІСѓСЋ С…РёРјРёСЋ"}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t("manual_link_desc") || "РћРїРёСЃР°РЅРёРµ (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)"}</Label>
                        <Textarea 
                          value={manualLink.description} 
                          onChange={(e) => setManualLink({ ...manualLink, description: e.target.value })}
                          placeholder={t("brief_description") || "РљСЂР°С‚РєРѕ Рѕ СЃРѕРґРµСЂР¶РёРјРѕРј..."}
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t("category")} *</Label>
                        <Select 
                          value={manualLink.category} 
                          onValueChange={(v) => setManualLink({ ...manualLink, category: v })}
                        >
                          <SelectTrigger><SelectValue placeholder={t("select_category")} /></SelectTrigger>
                          <SelectContent>
                            {categories?.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setSaveAsLinkMode(false)} className="flex-1">
                          {t("back") || "РќР°Р·Р°Рґ"}
                        </Button>
                        <Button size="sm" onClick={handleSaveAsLink} disabled={isSavingRecipe || createRecipe.isPending} className="flex-1">
                          {(isSavingRecipe || createRecipe.isPending) ? (t("saving") || "РЎРѕС…СЂР°РЅРµРЅРёРµ...") : (t("save") || "РЎРѕС…СЂР°РЅРёС‚СЊ")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {(stage === "fetching" || stage === "analyzing" || stage === "formatting" || stage === "transcribing" || stage === "preparing_local_model" || stage === "parsing_transcript") && (
            <div className="flex flex-col items-center py-8 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="space-y-2 text-center">
                {((stage === "transcribing" || stage === "preparing_local_model" || stage === "parsing_transcript")
                  ? ["fetching", "analyzing", "transcribing", "preparing_local_model", "parsing_transcript"]
                  : ["fetching", "analyzing", "formatting"] as Stage[]
                ).map((s, _index, stages) => (
                  <div key={s} className={`text-sm flex items-center gap-2 justify-center transition-opacity ${stage === s ? "text-foreground font-medium" : stages.indexOf(stage) > stages.indexOf(s) ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                    {stages.indexOf(stage) > stages.indexOf(s) ? <Check className="h-3.5 w-3.5 text-primary" /> : stage === s ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <div className="h-3.5 w-3.5" />}
                    {STAGE_LABELS[s]}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage === "done" && parsed && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>{parsed.localDraft ? t("local_recipe_draft_notice") : t("auto_created_check")}</span>
              </div>
              {parsed.localDraft && getQualityWarningMessages(parsed.quality).length > 0 && (
                <div className={`space-y-1.5 p-3 rounded-lg border text-sm ${
                  parsed.quality?.score === "low"
                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                    : "bg-amber-500/10 border-amber-500/30 text-foreground"
                }`}>
                  {getQualityWarningMessages(parsed.quality).map((message, index) => (
                    <div key={`${message}-${index}`} className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{message}</span>
                    </div>
                  ))}
                </div>
              )}

              {!editMode ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{parsed.title}</CardTitle>
                    {parsed.description && <p className="text-sm text-muted-foreground">{parsed.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {parsed.thumbnail && <div className="aspect-video overflow-hidden rounded-lg"><img src={parsed.thumbnail} alt={parsed.title} className="w-full h-full object-cover" /></div>}
                    <div className="flex flex-wrap gap-2">
                      {parsed.cooking_time && <Badge variant="outline">вЏ± {parsed.cooking_time}</Badge>}
                      {parsed.servings && <Badge variant="outline">рџ‘Ґ {parsed.servings}</Badge>}
                      {parsed.difficulty && <Badge variant="outline">{parsed.difficulty}</Badge>}
                    </div>
                    {parsed.ingredients?.length > 0 && <div><h4 className="font-medium mb-1.5 text-sm">{t("ingredients")}</h4><ul className="text-sm space-y-1">{parsed.ingredients.map((ing, i) => <li key={i} className="flex gap-2"><span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-primary flex-shrink-0" />{ing}</li>)}</ul></div>}
                    {parsed.instructions?.length > 0 && <div><h4 className="font-medium mb-1.5 text-sm">{t("cooking")}</h4><ol className="text-sm space-y-1.5">{parsed.instructions.map((step, i) => <li key={i} className="flex gap-2"><span className="text-primary font-medium">{i + 1}.</span>{step}</li>)}</ol></div>}
                    {parsed.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{parsed.tags.map((tag, i) => <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>)}</div>}
                    {parsed.notes && <p className="text-xs text-muted-foreground italic">{parsed.notes}</p>}
                    {parsed.source?.sourceUrl && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                        <Link2 className="h-3.5 w-3.5" /><span>{t("source")}:</span>
                        <a href={parsed.source.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-[300px]">
                          {parsed.source.sourcePlatform === "youtube" ? "YouTube" : parsed.source.sourcePlatform === "tiktok" ? "TikTok" : new URL(parsed.source.sourceUrl).hostname}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  <div><Label>{t("title")}</Label><Input value={editData.title} onChange={(e) => setEditData({ ...editData, title: e.target.value })} /></div>
                  <div><Label>{t("description")}</Label><Textarea value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} rows={2} /></div>
                  <div><Label>{t("ingredients_per_line")}</Label><Textarea value={editData.ingredients} onChange={(e) => setEditData({ ...editData, ingredients: e.target.value })} rows={5} /></div>
                  <div><Label>{t("instructions_per_line")}</Label><Textarea value={editData.instructions} onChange={(e) => setEditData({ ...editData, instructions: e.target.value })} rows={5} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("time")}</Label><Input value={editData.cooking_time} onChange={(e) => setEditData({ ...editData, cooking_time: e.target.value })} /></div>
                    <div><Label>{t("servings")}</Label><Input type="number" value={editData.servings} onChange={(e) => setEditData({ ...editData, servings: parseInt(e.target.value) || 1 })} /></div>
                  </div>
                  <div><Label>{t("difficulty")}</Label><Select value={editData.difficulty} onValueChange={(v) => setEditData({ ...editData, difficulty: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">{t("easy")}</SelectItem><SelectItem value="medium">{t("medium")}</SelectItem><SelectItem value="hard">{t("hard")}</SelectItem></SelectContent></Select></div>
                  <div><Label>{t("tags")}</Label><Input value={editData.tags} onChange={(e) => setEditData({ ...editData, tags: e.target.value })} /></div>
                  <div><Label>{t("notes")}</Label><Textarea value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={2} /></div>
                </div>
              )}

              <div>
                <Label>{t("category")} *</Label>
                <Select value={editData.category} onValueChange={(v) => setEditData({ ...editData, category: v })}>
                  <SelectTrigger><SelectValue placeholder={t("select_category")} /></SelectTrigger>
                  <SelectContent>{categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {parsed.category_hint && <p className="text-xs text-muted-foreground mt-1">{t("ai_hint")}: {parsed.category_hint}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex gap-2 justify-end">
          {stage === "done" && parsed && (
            <>
              <Button variant="outline" onClick={reset} disabled={isSavingRecipe || createRecipe.isPending}>{t("cancel")}</Button>
              <Button variant="outline" onClick={() => setEditMode(!editMode)} disabled={isSavingRecipe || createRecipe.isPending}>{editMode ? t("preview") : t("edit")}</Button>
              <Button onClick={handleSave} disabled={isSavingRecipe || createRecipe.isPending}>{(isSavingRecipe || createRecipe.isPending) ? t("saving") : t("save")}</Button>
            </>
          )}
          {stage === "error" && !saveAsLinkMode && <Button variant="outline" onClick={reset}>{t("try_again")}</Button>}
        </div>
      </div>
    </div>
  );
}
