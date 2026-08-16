const { parseRecipeTextLocal } = require("./local-recipe-parser.cjs");
const { runHelper, runTranscription, validateVideoUrl } = require("./transcription.cjs");
const http = require("http");
const https = require("https");

const IMPORT_VIDEO_RECIPE_LOCAL_CHANNEL = "tasteTrace:importVideoRecipeLocal";

function errorResult(code, message, details = undefined) {
  return {
    success: false,
    error: { code, message },
    details,
  };
}

function cleanText(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeRequest(payload) {
  if (typeof payload === "string") return { type: "url", url: payload, language: undefined };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.type === "file" || payload.path || payload.filePath) {
    return {
      type: "file",
      path: payload.path || payload.filePath,
      name: typeof payload.name === "string" ? payload.name : undefined,
      language: typeof payload.language === "string" ? payload.language : undefined,
    };
  }
  return {
    type: "url",
    url: payload.url,
    language: typeof payload.language === "string" ? payload.language : undefined,
  };
}

function normalizeSourceUrl(url) {
  return String(url || "").trim().replace(/[.,;:!?)]*$/u, "");
}

function normalizePlatform(url, platform) {
  if (platform) return String(platform).toLowerCase();
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
    if (host.endsWith("ok.ru")) return "ok";
    if (host.endsWith("instagram.com")) return "instagram";
    if (host.endsWith("tiktok.com")) return "tiktok";
    return host.split(".")[0] || "video";
  } catch {
    return "video";
  }
}

function normalizeLocalFileName(filePath, name) {
  if (typeof name === "string" && name.trim()) return name.trim();
  try {
    return require("path").basename(String(filePath || ""));
  } catch {
    return "video";
  }
}

function isLikelyWebPlatformPage(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return (
      host.endsWith("ok.ru") ||
      host.endsWith("instagram.com") ||
      host.endsWith("tiktok.com") ||
      host.endsWith("dailymotion.com") ||
      host.endsWith("rutube.ru") ||
      host.endsWith("vk.com")
    );
  } catch {
    return false;
  }
}

function extractMetaContent(html, nameOrProperty) {
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

function extractTitle(html) {
  return cleanText(
    extractMetaContent(html, "og:title") ||
      extractMetaContent(html, "title") ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      "",
  );
}

function isGenericVideoTitle(title) {
  const normalized = cleanText(title).toLowerCase();
  return ["video", "video embed", "ok video", "vk video", "видео"].includes(normalized);
}

function extractJsonLdObjects(html) {
  const objects = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(match[1]).replace(/\\u0026/g, "&"));
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        objects.push(item);
        if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
        if (Array.isArray(item.video)) queue.push(...item.video);
      }
    } catch {
      // Ignore malformed third-party structured data.
    }
  }
  return objects;
}

function extractLinkedVideoUrl(html, pageUrl) {
  const jsonLd = extractJsonLdObjects(html);
  for (const item of jsonLd) {
    if (item?.["@type"] === "VideoObject" && typeof item.url === "string") return item.url;
  }

  const metaVideo =
    extractMetaContent(html, "og:video:secure_url") ||
    extractMetaContent(html, "og:video:url") ||
    extractMetaContent(html, "og:video");
  if (metaVideo) {
    const match = metaVideo.match(/ok\.ru\/(?:videoembed|web-api\/video\/moviePlayer)\/(\d+)/i);
    if (match) return `https://ok.ru/video/${match[1]}`;
    return metaVideo.replace(/^http:/i, "https:");
  }

  const hrefMatch = html.match(/https?:\/\/ok\.ru\/video\/\d+/i);
  if (hrefMatch) return hrefMatch[0];

  try {
    return new URL(pageUrl).href;
  } catch {
    return pageUrl;
  }
}

function extractArticleText(html) {
  const jsonLd = extractJsonLdObjects(html);
  const article = jsonLd.find((item) => {
    const type = item?.["@type"];
    return type === "Article" || (Array.isArray(type) && type.includes("Article"));
  });

  return cleanText(
    article?.articleBody ||
      article?.description ||
      extractMetaContent(html, "og:description") ||
      extractMetaContent(html, "description") ||
      "",
  );
}

function fetchText(url, allowInsecureTls = false) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }

    const transport = parsed.protocol === "http:" ? http : https;
    const request = transport.request(
      parsed,
      {
        method: "GET",
        rejectUnauthorized: !allowInsecureTls,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
          response.resume();
          const redirectUrl = new URL(response.headers.location, parsed).href;
          fetchText(redirectUrl, allowInsecureTls).then(resolve, reject);
          return;
        }
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          response.resume();
          reject(new Error(`Platform page request failed: ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    request.setTimeout(30000, () => {
      request.destroy(new Error("Platform page request timed out."));
    });
    request.on("error", reject);
    request.end();
  });
}

async function fetchPlatformPageText(url) {
  let html;
  try {
    html = await fetchText(url, false);
  } catch (error) {
    if (!String(error?.code || error?.message || "").match(/CERT|TLS|SSL|UNABLE_TO_VERIFY/i)) {
      throw error;
    }
    html = await fetchText(url, true);
  }
  return {
    title: extractTitle(html),
    description: extractArticleText(html),
    thumbnail:
      extractMetaContent(html, "og:image:secure_url") ||
      extractMetaContent(html, "og:image") ||
      extractMetaContent(html, "twitter:image") ||
      "",
    linkedVideoUrl: extractLinkedVideoUrl(html, url),
  };
}

function addSource(evidence, kind, text, meta = {}) {
  const cleaned = cleanText(text);
  if (!cleaned) return;
  evidence.sources.push({
    kind,
    text: cleaned,
    ...meta,
  });
}

function evidenceText(evidence) {
  return evidence.sources.map((source) => source.text).join("\n\n");
}

function isRecipeCalculationLesson(text) {
  const compact = cleanText(text).replace(/\s+/g, " ").trim();
  if (!compact) return false;
  const lessonMarkers = compact.match(/\b(?:calculate|calculating|scale\s+up|scale\s+down|scaleups?|proportion|ratio\s+method|unitary\s+method|maths?|mathematics|question|answer|worksheet|lesson|how\s+much\s+of\s+each\s+ingredient)\b/giu) || [];
  const prepMarkers = compact.match(/\b(?:add|bake|boil|chill|cook|cover|fry|heat|knead|mix|roast|simmer|stir|transfer|whisk)\b/giu) || [];
  return lessonMarkers.length >= 3 && prepMarkers.length < 2;
}

const FOOD_WORD_PATTERN =
  /(?:морожен|сливк|пюре|мук|сахар|соль|перец|молок|масл|яйц|картоф|лук|морков|капуст|томат|помидор|св[её]кл|рис|фасол|чеснок|зелень|укроп|петруш|говядин|куриц|сыр|арбуз|желатин|ягод|фрукт|малин|ежевик|голубик|виноград|flour|sugar|salt|pepper|milk|cream|butter|egg|potato|onion|carrot|tomato|rice|beans|garlic|cheese|chicken|beef|pork|fish|oil|yeast|water|coconut|ginger|curry|masala)/giu;

const QUANTITY_PATTERN =
  /\d+(?:[.,]\d+)?\s*(?:г|гр|кг|мг|мл|л|шт|ст\.?\s*л|ч\.?\s*л|ложк|стакан|g|gr|gm|kg|mg|ml|l|oz|lb|lbs|tbsp|tsp|cups?|pcs?)/giu;

const ACTION_PATTERN =
  /(?:нареж|вар|жар|туш|запек|смеш|добав|готов|кипят|обжар|перемеш|взбей|охлад|замороз|залей|заливаем|вылож|выкладываем|бер[её]м|вынимаем|разводим|соединяем|отправляем|cook|boil|fry|bake|mix|stir|freeze|chill|add|cover|heat|knead|roast|simmer|transfer|whisk|pour|place|remove|serve)/giu;

const INSTRUCTION_HEADING_PATTERN =
  /(?:how\s+to\s+(?:prepare|make|cook)|prepar(?:e|ation)|directions?|instructions?|method|cooking\s+method|steps?|способ\s+приготовления|как\s+приготовить|приготовление|инструкции?|шаги)\s*:?/iu;

const INGREDIENT_HEADING_PATTERN = /(?:ingredients?|ингредиенты|состав)\s*:?/iu;
const TEMPERATURE_PATTERN = /\d{2,3}\s*(?:°\s*[CFС]?|degrees?|градус)/giu;
const COOKING_TIME_PATTERN = /\d+(?:[.,]\d+)?\s*(?:минут|мин\.?|час|hours?|hrs?|minutes?|mins?)/giu;
const SERVINGS_PATTERN = /\d+(?:[.,]\d+)?\s*(?:порци|servings?|portions?)/giu;

function testPattern(pattern, text) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function analyzeTextCoverage(text) {
  const compact = cleanText(text).replace(/\s+/g, " ").trim();
  if (!compact) {
    return {
      textChars: 0,
      foodWords: 0,
      quantities: 0,
      actions: 0,
      hasIngredientHeading: false,
      hasInstructionHeading: false,
      hasIngredients: false,
      hasQuantities: false,
      hasInstructions: false,
      hasCookingTime: false,
      hasTemperature: false,
      hasServings: false,
    };
  }

  const foodWords = compact.match(FOOD_WORD_PATTERN) || [];
  const quantities = compact.match(QUANTITY_PATTERN) || [];
  const actions = compact.match(ACTION_PATTERN) || [];
  const hasIngredientHeading = INGREDIENT_HEADING_PATTERN.test(compact);
  const hasInstructionHeading = INSTRUCTION_HEADING_PATTERN.test(compact);
  const hasQuantities = quantities.length > 0;
  const hasIngredients =
    foodWords.length >= 3 ||
    (foodWords.length >= 2 && (hasQuantities || hasIngredientHeading)) ||
    (hasIngredientHeading && hasQuantities);
  const hasInstructions =
    actions.length >= 2 ||
    (actions.length >= 1 && hasInstructionHeading);

  return {
    textChars: compact.length,
    foodWords: foodWords.length,
    quantities: quantities.length,
    actions: actions.length,
    hasIngredientHeading,
    hasInstructionHeading,
    hasIngredients,
    hasQuantities,
    hasInstructions,
    hasCookingTime: testPattern(COOKING_TIME_PATTERN, compact),
    hasTemperature: testPattern(TEMPERATURE_PATTERN, compact),
    hasServings: testPattern(SERVINGS_PATTERN, compact),
  };
}

function analyzeRecipeCoverage(evidence) {
  const sourceCoverage = (evidence.sources || []).map((source) => ({
    kind: source.kind,
    source: source.source,
    ...analyzeTextCoverage(source.text),
  }));
  const combined = analyzeTextCoverage(evidenceText(evidence));
  const hasTitle = Boolean(cleanText(evidence.title || ""));
  const hasIngredients = sourceCoverage.some((item) => item.hasIngredients) || combined.hasIngredients;
  const hasInstructions = sourceCoverage.some((item) => item.hasInstructions) || combined.hasInstructions;
  const hasQuantities = sourceCoverage.some((item) => item.hasQuantities) || combined.hasQuantities;
  const missingCritical = [];
  if (!hasIngredients) missingCritical.push("ingredients");
  if (!hasInstructions) missingCritical.push("instructions");
  const notCookingRecipe = isRecipeCalculationLesson(evidenceText(evidence));

  return {
    hasTitle,
    hasIngredients,
    hasQuantities,
    hasInstructions,
    hasCookingTime: sourceCoverage.some((item) => item.hasCookingTime) || combined.hasCookingTime,
    hasTemperature: sourceCoverage.some((item) => item.hasTemperature) || combined.hasTemperature,
    hasServings: sourceCoverage.some((item) => item.hasServings) || combined.hasServings,
    missingCritical,
    needsMoreEvidence: missingCritical.length > 0,
    sufficient: !notCookingRecipe && missingCritical.length === 0,
    notCookingRecipe,
    sourceCoverage,
  };
}

function shouldTrySpeechBeforeOcr(evidence, coverage) {
  return (
    Boolean(coverage?.hasIngredients) &&
    !coverage?.hasInstructions &&
    evidence.sources.some((source) => ["platform_page", "description", "captions"].includes(source.kind) && cleanText(source.text))
  );
}

function hasMeaningfulInstructionSource(evidence) {
  return evidence.sources.some((source) => {
    if (!["description", "captions", "ocr", "speech"].includes(source.kind)) return false;
    const coverage = analyzeTextCoverage(source.text);
    return coverage.hasInstructions;
  });
}

function assessEvidence(evidence) {
  const text = evidenceText(evidence);
  const compact = text.replace(/\s+/g, " ").trim();
  const foodWords =
    compact.match(/(?:морожен|сливк|пюре|мука|сахар|соль|перец|молоко|масло|яйц|картоф|лук|морков|капуст|томат|помидор|св[её]кл|рис|фасол|чеснок|зелень|укроп|петруш|говядин|куриц|сыр|flour|sugar|salt|pepper|milk|cream|butter|egg|potato|onion|carrot|tomato|rice|beans|garlic|cheese)/giu) || [];
  const quantities = compact.match(/\d+(?:[.,]\d+)?\s*(?:г|гр|кг|мл|л|шт|ст\.?\s*л|ч\.?\s*л|g|kg|ml|l|tbsp|tsp|pcs?)/giu) || [];
  const actions =
    compact.match(/(?:нареж|вар|жар|туш|запек|смеш|добав|готов|кипят|обжар|перемеш|взбей|охлад|замороз|cook|boil|fry|bake|mix|stir|freeze|chill)/giu) || [];
  const dishWords = compact.match(/(?:рецепт|ингредиент|ingredient|recipe|блюдо|суп|борщ|салат|пирог|торт|мороженое|dish)/giu) || [];
  const platformNoise =
    compact.match(/(?:подпис|лайк|коммент|вступай|социальная сеть|зарегистрироваться|subscribe|follow|like|comment)/giu) || [];

  let score = 0;
  if (foodWords.length >= 2) score += 2;
  else if (foodWords.length === 1) score += 1;
  if (quantities.length >= 2) score += 2;
  else if (quantities.length === 1) score += 1;
  if (actions.length >= 2) score += 2;
  else if (actions.length === 1) score += 1;
  if (dishWords.length >= 1) score += 1;
  if (compact.length >= 250 && foodWords.length >= 1) score += 1;
  if (platformNoise.length >= 5 && foodWords.length < 2) score -= 2;
  const recipeCalculationLesson = isRecipeCalculationLesson(compact);
  if (recipeCalculationLesson) score = Math.min(score, 1);

  const sufficient =
    !recipeCalculationLesson &&
    score >= 3 &&
    (foodWords.length >= 2 || quantities.length >= 1 || (foodWords.length >= 1 && actions.length >= 2 && compact.length >= 600));

  return {
    score,
    sufficient,
    facts: {
      textChars: compact.length,
      foodWords: foodWords.length,
      quantities: quantities.length,
      cookingActions: actions.length,
      dishWords: dishWords.length,
      platformNoise: platformNoise.length,
      recipeCalculationLesson,
    },
  };
}

function isNotCookingRecipeAssessment(assessment) {
  return Boolean(assessment?.facts?.recipeCalculationLesson);
}

function getSourcesByKind(evidence, kind) {
  return evidence.sources.filter((source) => source.kind === kind);
}

const CORE_TITLE_FOOD_TERMS = [
  { key: "chicken", pattern: /\bchicken\b|куриц/iu },
  { key: "bean", pattern: /\bbeans?\b|\bchickpeas?\b|фасол/iu },
  { key: "beef", pattern: /\bbeef\b|говядин/iu },
  { key: "pork", pattern: /\bpork\b|свинин/iu },
  { key: "fish", pattern: /\bfish\b|рыб/iu },
  { key: "potato", pattern: /\bpotatoes?\b|карто/iu },
  { key: "rice", pattern: /\brice\b|рис/iu },
  { key: "egg", pattern: /\beggs?\b|яйц/iu },
  { key: "cheese", pattern: /\bcheese\b|сыр/iu },
  { key: "tomato", pattern: /\btomatoes?\b|томат|помидор/iu },
  { key: "onion", pattern: /\bonions?\b|лук/iu },
  { key: "garlic", pattern: /\bgarlic\b|чеснок/iu },
  { key: "mushroom", pattern: /\bmushrooms?\b|гриб/iu },
  { key: "lentil", pattern: /\blentils?\b|чечевиц/iu },
  { key: "pea", pattern: /\bpeas?\b|горох/iu },
  { key: "cabbage", pattern: /\bcabbage\b|капуст/iu },
];

function extractCoreTitleFoodTerms(title) {
  const cleaned = cleanText(title).replace(/[|:()[\]{}]/g, " ");
  return CORE_TITLE_FOOD_TERMS.filter((term) => term.pattern.test(cleaned));
}

function recipeText(recipe) {
  return cleanText([
    recipe?.title,
    recipe?.description,
    ...(Array.isArray(recipe?.ingredients) ? recipe.ingredients : []),
    ...(Array.isArray(recipe?.instructions) ? recipe.instructions : []),
    recipe?.notes,
  ].join("\n"));
}

function validateRecipeAgainstTitle(recipe, evidence) {
  const requiredTerms = extractCoreTitleFoodTerms(evidence.title || recipe?.title || "");
  if (!requiredTerms.length) return { ok: true, missing: [] };

  const text = cleanText((Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).join("\n"));
  const missing = requiredTerms.filter((term) => !term.pattern.test(text));
  return {
    ok: missing.length === 0,
    missing: missing.map((term) => term.key),
  };
}

function isStructuredDraftResult(result) {
  return (
    result?.status === "structured_draft" ||
    result?.runtime?.engine === "structured-text" ||
    (result?.quality?.warnings || []).some((warning) => warning?.code === "STRUCTURED_DRAFT")
  );
}

function hasRichRecipeDescription(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return false;
  const quantityCount = (cleaned.match(/\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|tbsp|tsp|cups?|cup|гр|г|кг|мл|л|ст\.?\s*л|ч\.?\s*л)/giu) || []).length;
  const hasInstructionHeading = /(?:how\s+to\s+(?:prepare|make|cook)|prepar(?:e|ation)|directions?|instructions?|method|cooking|steps?|способ\s+приготовления|как\s+приготовить|приготовление|инструкции?|шаги)\s*:?/iu.test(cleaned);
  const hasIngredientHeading = /(?:ingredients?|ингредиенты)\s*:?/iu.test(cleaned);
  return cleaned.length >= 500 && quantityCount >= 5 && (hasInstructionHeading || hasIngredientHeading);
}

function hasRecipeInstructions(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/u)
    .map((line) => cleanText(line))
    .some((line) =>
      line.length <= 120 &&
      /^(?:how\s+to\s+(?:prepare|make|cook)|prepar(?:e|ation)|directions?|instructions?|method|cooking\s+method|steps?)\s*:?\s*$/iu.test(line)
    );
}

function cloneEvidenceWithSources(evidence, sources) {
  return {
    ...evidence,
    sources: sources.map((source) => ({ ...source })),
    diagnostics: {
      ...evidence.diagnostics,
      assessments: [...evidence.diagnostics.assessments],
      warnings: [...evidence.diagnostics.warnings],
      stagesRun: [...evidence.diagnostics.stagesRun],
      stagesSkipped: [...evidence.diagnostics.stagesSkipped],
    },
  };
}

function parseServingsFromText(text) {
  const match = String(text || "").match(/(?:approx\.?\s*)?(\d{1,3})\s*(?:doughnuts?|donuts?|servings?|portions?|порци)/iu);
  return match ? Number.parseInt(match[1], 10) : null;
}

function isRecipeSectionHeading(line) {
  return /^(?:for\s+.+|для\s+.+)\s*:$/iu.test(String(line || "").trim());
}

function isIngredientListLine(line) {
  const cleaned = String(line || "").trim();
  if (!cleaned) return false;
  if (isRecipeSectionHeading(cleaned)) return true;
  return (
    /^(?:[-*•▪✔]\s*)?.{1,90}\d+(?:[.,]\d+)?\s*(?:g|gr|kg|mg|ml|l|oz|lb|lbs|tbsp|tsp|cups?|cup|pcs?|шт|г|гр|кг|мл|л|ст\.?\s*л|ч\.?\s*л)(?=$|[\s.,;:)])/iu.test(cleaned) ||
    /^(?:[-*•▪]\s*)?(?:one|two|three|four|five|six|seven|eight|nine|ten|salt|pepper|oil|paprika|water|egg|eggs)\b/iu.test(cleaned) ||
    /^(?:соль|перец|зелень|укроп|петрушка|лавровый\s+лист|масло|вода)(?![\p{L}\p{N}]).*(?:по\s+вкусу|по\s+желанию)?/iu.test(cleaned)
  );
}

function cleanListMarker(line) {
  return cleanText(line).replace(/^[\u200b-\u200f\u2060\ufeff\s]*(?:[-*•▪✔]\s*)?[\u200b-\u200f\u2060\ufeff\s]*/, "").trim();
}

function splitNumberedInstructions(text) {
  const normalized = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!normalized) return [];

  const matches = [...normalized.matchAll(/(?:^|\n)\s*(\d{1,2})[.)]\s+([\s\S]*?)(?=(?:\n\s*\d{1,2}[.)]\s+)|$)/gu)];
  if (matches.length >= 2) {
    return matches.map((match) => cleanText(match[2])).filter((item) => item.length >= 8);
  }

  return normalized
    .split(/\n+/u)
    .map((line) => cleanText(line.replace(/^\d{1,2}[.)]\s*/, "")))
    .filter((line) => line.length >= 8);
}

function splitSpeechInstructions(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const parts = cleaned
    .split(/(?<=[.!?…])\s+|(?:\s+и\s+буду\s+)|(?:\s+затем\s+)|(?:\s+потом\s+)/iu)
    .map((line) => cleanText(line))
    .filter((line) => line.length >= 12)
    .filter((line) => /(?:вар|нарез|добав|смеш|расклад|жар|туш|запек|обжар|перемеш|готов|кипят|нашинк|cook|boil|cut|add|mix|fry|bake)/iu.test(line));
  return parts.length >= 2 ? parts : [cleaned].filter((line) => line.length >= 20);
}

function extractIngredientLinesFromSources(sources) {
  const lines = [];
  for (const source of sources) {
    for (const line of String(source.text || "").replace(/\r\n?/g, "\n").replace(/\s*✔\s*/g, "\n✔").split("\n")) {
      const cleaned = cleanListMarker(line);
      if (!cleaned || /^[-*=_]{3,}$/u.test(cleaned)) continue;
      if (isIngredientListLine(cleaned)) lines.push(cleaned);
    }
  }
  return [...new Set(lines)].slice(0, 80);
}

function tryBuildIngredientSpeechRecipe(evidence) {
  const ingredientSources = evidence.sources.filter((source) => ["platform_page", "description"].includes(source.kind));
  const instructionSources = evidence.sources.filter((source) => ["speech", "captions"].includes(source.kind) && source.text);
  if (!ingredientSources.length || !instructionSources.length) return null;

  const ingredients = extractIngredientLinesFromSources(ingredientSources);
  const instructions = instructionSources.flatMap((source) => splitSpeechInstructions(source.text)).slice(0, 40);
  if (ingredients.length < 3 || instructions.length < 2) return null;

  const title = cleanText(evidence.title) || "Video recipe";
  return {
    title,
    description: title,
    ingredients,
    instructions,
    cooking_time: "",
    servings: parseServingsFromText(ingredientSources.map((source) => source.text).join("\n")),
    difficulty: "medium",
    tags: ["video", "draft"],
    notes: "Draft assembled from visible source ingredients and video transcript. Please review before final saving.",
    category_hint: "",
  };
}

function tryBuildExplicitDescriptionRecipe(evidence) {
  const descriptionSource = getSourcesByKind(evidence, "description").find((source) => source.text);
  const description = descriptionSource?.text || "";
  if (!description) return null;

  const ingredientMatch = description.match(/(?:^|\n)\s*(?:ingredients?|ингредиенты|состав)\s*:?\s*/iu);
  const instructionMatch = description.match(
    /(?:^|\n)\s*(?:how\s+to\s+(?:prepare|make|cook)|prepar(?:e|ation)|directions?|instructions?|method|cooking\s+method|steps?|способ\s+приготовления|как\s+приготовить|приготовление|инструкции?|шаги)\s*:?\s*/iu,
  );
  if (!ingredientMatch || !instructionMatch || instructionMatch.index <= ingredientMatch.index) return null;

  const intro = cleanText(description.slice(0, ingredientMatch.index));
  const ingredientBlock = description.slice(ingredientMatch.index + ingredientMatch[0].length, instructionMatch.index);
  const instructionBlock = description.slice(instructionMatch.index + instructionMatch[0].length);

  const ingredients = ingredientBlock
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanListMarker)
    .filter((line) => line && !/^[-*=_]{3,}$/u.test(line))
    .filter((line) => isIngredientListLine(line))
    .slice(0, 80);

  const instructions = splitNumberedInstructions(instructionBlock)
    .filter((line) => !/^(?:my\s+etsy\s+shop|equipment\s+that\s+i\s+use|follow\s+me|more\s+.+recipes|music|instagram|facebook|https?:\/\/)/iu.test(line))
    .slice(0, 40);

  if (ingredients.length < 3 || instructions.length < 3) return null;

  const title = cleanText(evidence.title) || cleanText(intro.split(/\n/u).find(Boolean)) || "Video recipe";
  return {
    title,
    description: intro.split(/\n/u).map(cleanText).find((line) => line.length >= 30) || title,
    ingredients,
    instructions,
    cooking_time: "",
    servings: parseServingsFromText(ingredientBlock) || parseServingsFromText(title),
    difficulty: "medium",
    tags: ["video", "draft"],
    notes: "Draft assembled from explicit ingredient and preparation blocks in the video description.",
    category_hint: "",
  };
}

function sanitizeSourceTextForParser(text) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

  const kept = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/https?:\/\/|(?:^|\s)(?:www\.|youtube\.com|youtu\.be|instagram\.com|facebook\.com|tiktok\.com|etsy\.com|kit\.co)\S*/iu.test(line)) {
      continue;
    }
    if (/^(?:[#＠@]\S+\s*){1,}$/iu.test(line)) {
      continue;
    }
    if (/(?:subscribe|follow me|my etsy shop|equipment that i use|more .*recipes|watch more|music:|epidemicsound|sub_confirmation|hello i am|welcome to|best destination|cooking skills|food relaxation|no voice|no music|just real kitchen sounds|try it yourself|if you love to cook|develop your cooking skills)/iu.test(lower)) {
      continue;
    }
    if (line.length <= 40 && /(?:asmr|recipes?|cooking|cook|food|breakfast|toast|kitchen|potato fritters|bread|simple|easy|budget-friendly)/iu.test(line) && !testPattern(QUANTITY_PATTERN, line)) {
      continue;
    }
    kept.push(line);
  }

  return kept.join("\n");
}

function buildParserInput(evidence) {
  const sections = [];
  if (evidence.title) sections.push(`TITLE:\n${evidence.title}`);
  for (const source of evidence.sources) {
    const sourceText = sanitizeSourceTextForParser(source.text);
    if (!sourceText) continue;
    const headingByKind = {
      description: "VIDEO DESCRIPTION",
      captions: "VIDEO TRANSCRIPT",
      chapters: "CHAPTERS",
      ocr: "VIDEO OCR TEXT",
      speech: "SPEECH TRANSCRIPT",
      platform_page: "PLATFORM PAGE TEXT",
    };
    sections.push(`${headingByKind[source.kind] || source.kind.toUpperCase()}:\n${sourceText}`);
  }
  return sections.join("\n\n");
}

function buildParsedRecipe(recipeResult, evidence, originalUrl) {
  const platform = normalizePlatform(originalUrl, evidence.platform);
  return {
    ...recipeResult.recipe,
    thumbnail: evidence.thumbnail || recipeResult.recipe?.thumbnail || "",
    source: {
      sourceType: "video",
      sourceUrl: originalUrl,
      sourcePlatform: platform,
    },
    localDraft: true,
    quality: recipeResult.quality,
    evidenceDiagnostics: evidence.diagnostics,
  };
}

function buildParsedFileRecipe(recipeResult, evidence, fileInput) {
  return {
    ...recipeResult.recipe,
    thumbnail: recipeResult.recipe?.thumbnail || "",
    source: {
      sourceType: "local_file",
      sourceFileName: fileInput.name,
      sourcePlatform: "local_file",
      detectedLanguage: evidence.language || null,
      importedAt: new Date().toISOString(),
    },
    localDraft: true,
    quality: recipeResult.quality,
    evidenceDiagnostics: evidence.diagnostics,
  };
}

function buildExplicitDescriptionResult(recipe, evidence, originalUrl) {
  return {
    success: true,
    recipe: buildParsedRecipe(
      {
        recipe,
        quality: {
          score: "medium",
          needs_review: true,
          warnings: [
            {
              code: "EXPLICIT_DESCRIPTION_DRAFT",
              message: "Recipe was drafted from explicit ingredient and preparation blocks in the video description.",
            },
          ],
        },
      },
      evidence,
      originalUrl,
    ),
    parserInput: "",
  };
}

async function tryParseEvidence(app, evidence, originalUrl) {
  const explicitRecipe = tryBuildExplicitDescriptionRecipe(evidence);
  if (explicitRecipe) {
    return buildExplicitDescriptionResult(explicitRecipe, evidence, originalUrl);
  }

  const ingredientSpeechRecipe = tryBuildIngredientSpeechRecipe(evidence);
  if (ingredientSpeechRecipe) {
    return buildExplicitDescriptionResult(ingredientSpeechRecipe, evidence, originalUrl);
  }

  const parserInput = buildParserInput(evidence);
  const parsed = await parseRecipeTextLocal(app, {
    text: parserInput,
    sourceLanguage: evidence.language || undefined,
  });
  if (!parsed.success || !parsed.recipe) {
    return {
      success: false,
      parsed,
      parserInput,
    };
  }
  const titleValidation = validateRecipeAgainstTitle(parsed.recipe, evidence);
  if (!titleValidation.ok) {
    if (isStructuredDraftResult(parsed)) {
      const llmParsed = await parseRecipeTextLocal(app, {
        text: parserInput,
        sourceLanguage: evidence.language || undefined,
        allowStructuredDraft: false,
      });
      if (!llmParsed.success || !llmParsed.recipe) {
        return {
          success: false,
          parsed: llmParsed,
          parserInput,
        };
      }
      const llmTitleValidation = validateRecipeAgainstTitle(llmParsed.recipe, evidence);
      if (llmTitleValidation.ok) {
        return {
          success: true,
          recipe: buildParsedRecipe(llmParsed, evidence, originalUrl),
          parser: llmParsed,
          parserInput,
        };
      }
    }
    return {
      success: false,
      parsed: errorResult(
        "RECIPE_CORE_INGREDIENT_MISSING",
        `Recipe draft is missing core ingredient(s) from the video title: ${titleValidation.missing.join(", ")}.`,
        { missing: titleValidation.missing },
      ),
      parserInput,
    };
  }
  return {
    success: true,
    recipe: buildParsedRecipe(parsed, evidence, originalUrl),
    parser: parsed,
    parserInput,
  };
}

async function importLocalVideoFileRecipe(app, request) {
  const fileName = normalizeLocalFileName(request.path, request.name);
  const evidence = {
    title: fileName.replace(/\.[^.]+$/u, ""),
    platform: "local_file",
    language: null,
    thumbnail: "",
    sources: [],
    diagnostics: {
      stagesRun: [],
      stagesSkipped: ["platform_page_text", "platform_video_text", "video_ocr"],
      assessments: [],
      warnings: [],
      linkedVideoUrl: null,
    },
  };

  evidence.diagnostics.stagesRun.push("audio_transcription");
  const transcript = await runTranscription(app, {
    type: "file",
    path: request.path,
    name: fileName,
    language: request.language,
  });

  if (!transcript?.success) {
    return errorResult(
      transcript?.error?.code || "AUDIO_TRANSCRIPTION_FAILED",
      transcript?.error?.message || "Audio transcription failed.",
      { evidence },
    );
  }

  evidence.language = transcript.language || evidence.language;
  addSource(evidence, "speech", transcript.text, {
    source: "faster_whisper",
    fileName,
    duration: transcript.duration || null,
  });

  const assessment = assessEvidence(evidence);
  const coverage = analyzeRecipeCoverage(evidence);
  evidence.diagnostics.assessments.push({ stage: "local_file_audio", ...assessment, coverage });
  if (coverage.notCookingRecipe || isNotCookingRecipeAssessment(assessment)) {
    return errorResult("NOT_A_COOKING_RECIPE", "В этом видео не удалось обнаружить полноценный рецепт.", { evidence });
  }
  if (!coverage.sufficient) {
    return errorResult("RECIPE_TEXT_INSUFFICIENT", "В этом видео не удалось обнаружить полноценный рецепт.", { evidence });
  }

  const parsed = await tryParseEvidence(app, evidence, "");
  if (parsed.success) {
    return {
      success: true,
      recipe: buildParsedFileRecipe(parsed.parser || parsed, evidence, { name: fileName }),
      evidence,
      stage: "audio_transcription",
    };
  }

  return errorResult(parsed.parsed?.error?.code || "RECIPE_PARSE_FAILED", parsed.parsed?.error?.message || "Local recipe parsing failed.", {
    evidence,
    parserInput: parsed.parserInput,
  });
}

async function importVideoRecipeLocal(app, payload) {
  const request = normalizeRequest(payload);
  if (!request) {
    return errorResult("INVALID_INPUT", "Video input must be a URL or selected file.");
  }

  if (request.type === "file") {
    if (typeof request.path !== "string" || !request.path.trim()) {
      return errorResult("INVALID_FILE", "Selected video file was not found.");
    }
    return importLocalVideoFileRecipe(app, request);
  }

  if (typeof request.url !== "string" || !request.url.trim()) {
    return errorResult("INVALID_URL", "URL must be a non-empty string.");
  }

  const originalUrl = normalizeSourceUrl(request.url);
  const evidence = {
    title: "",
    platform: normalizePlatform(originalUrl),
    language: null,
    thumbnail: "",
    sources: [],
    diagnostics: {
      stagesRun: [],
      stagesSkipped: [],
      assessments: [],
      warnings: [],
      linkedVideoUrl: null,
    },
  };

  let videoUrl = originalUrl;
  if (isLikelyWebPlatformPage(originalUrl)) {
    try {
      evidence.diagnostics.stagesRun.push("platform_page_text");
      const page = await fetchPlatformPageText(originalUrl);
      evidence.title = page.title || evidence.title;
      evidence.thumbnail = page.thumbnail || evidence.thumbnail;
      addSource(evidence, "description", page.description, { source: "platform_page_html" });
      if (page.linkedVideoUrl && validateVideoUrl(page.linkedVideoUrl)) {
        videoUrl = page.linkedVideoUrl;
        evidence.diagnostics.linkedVideoUrl = videoUrl;
      }
    } catch (error) {
      evidence.diagnostics.warnings.push({
        code: "PLATFORM_PAGE_TEXT_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (validateVideoUrl(videoUrl)) {
    evidence.diagnostics.stagesRun.push("platform_video_text");
    const platformText = await runHelper(app, {
      mode: "extract-video-text",
      url: videoUrl,
      includeOcr: false,
    });
    if (platformText?.success) {
      if (platformText.title && !isGenericVideoTitle(platformText.title)) {
        evidence.title = platformText.title;
      }
      evidence.platform = normalizePlatform(videoUrl, platformText.platform || evidence.platform);
      evidence.language = platformText.language || evidence.language;
      evidence.thumbnail = platformText.thumbnail || evidence.thumbnail;
      addSource(evidence, "description", platformText.description, { source: "platform_description" });
      if (hasRichRecipeDescription(platformText.description) && hasRecipeInstructions(platformText.description)) {
        evidence.diagnostics.stagesSkipped.push("platform_captions_for_stage1");
      } else {
        addSource(evidence, "captions", platformText.transcript, { source: platformText.transcriptSource || "platform_captions" });
      }
    } else {
      evidence.diagnostics.warnings.push({
        code: platformText?.error?.code || "PLATFORM_VIDEO_TEXT_FAILED",
        message: platformText?.error?.message || "Platform video text extraction failed.",
      });
    }
  }

  let assessment = assessEvidence(evidence);
  let coverage = analyzeRecipeCoverage(evidence);
  evidence.diagnostics.assessments.push({ stage: "stage1_platform_text", ...assessment, coverage });
  if (coverage.notCookingRecipe || isNotCookingRecipeAssessment(assessment)) {
    return errorResult("NOT_A_COOKING_RECIPE", "Источник похож на учебный материал о рецептах, но не на кулинарный рецепт.", { evidence });
  }
  if (coverage.sufficient && hasMeaningfulInstructionSource(evidence)) {
    const parsed = await tryParseEvidence(app, evidence, originalUrl);
    if (parsed.success) {
      evidence.diagnostics.stagesSkipped.push("video_ocr", "audio_transcription");
      return { success: true, recipe: parsed.recipe, evidence, stage: "platform_text" };
    }
    if (parsed.parsed?.error?.code !== "RECIPE_MODEL_NOT_FOUND") {
      return errorResult(parsed.parsed?.error?.code || "RECIPE_PARSE_FAILED", parsed.parsed?.error?.message || "Local recipe parsing failed.", {
        evidence,
        parserInput: parsed.parserInput,
      });
    }
  }

  const deferOcrUntilAfterSpeech = shouldTrySpeechBeforeOcr(evidence, coverage);
  if (deferOcrUntilAfterSpeech) {
    evidence.diagnostics.stagesSkipped.push("video_ocr_before_audio");
  } else if (validateVideoUrl(videoUrl)) {
    evidence.diagnostics.stagesRun.push("video_ocr");
    const withOcr = await runHelper(app, {
      mode: "extract-video-text",
      url: videoUrl,
      includeOcr: true,
    });
    if (withOcr?.success) {
      evidence.title = withOcr.title || evidence.title;
      evidence.platform = normalizePlatform(videoUrl, withOcr.platform || evidence.platform);
      evidence.language = withOcr.language || evidence.language;
      evidence.thumbnail = withOcr.thumbnail || evidence.thumbnail;
      if (!evidence.sources.some((source) => source.kind === "description")) {
        addSource(evidence, "description", withOcr.description, { source: "platform_description" });
      }
      if (!evidence.sources.some((source) => source.kind === "captions")) {
        addSource(evidence, "captions", withOcr.transcript, { source: withOcr.transcriptSource || "platform_captions" });
      }
      addSource(evidence, "ocr", withOcr.ocrText, {
        source: "video_ocr",
        events: withOcr.ocr?.events || [],
        engine: withOcr.ocr?.engine || "ocr",
      });
      if (withOcr.ocr?.error) {
        evidence.diagnostics.warnings.push(withOcr.ocr.error);
      }
    } else {
      evidence.diagnostics.warnings.push({
        code: withOcr?.error?.code || "VIDEO_OCR_FAILED",
        message: withOcr?.error?.message || "Video OCR failed.",
      });
    }
  } else {
    evidence.diagnostics.stagesSkipped.push("video_ocr");
  }

  assessment = assessEvidence(evidence);
  coverage = analyzeRecipeCoverage(evidence);
  evidence.diagnostics.assessments.push({ stage: "stage2_platform_plus_ocr", ...assessment, coverage });
  if (coverage.notCookingRecipe || isNotCookingRecipeAssessment(assessment)) {
    return errorResult("NOT_A_COOKING_RECIPE", "Источник похож на учебный материал о рецептах, но не на кулинарный рецепт.", { evidence });
  }
  if (coverage.sufficient && hasMeaningfulInstructionSource(evidence)) {
    const descriptionSources = getSourcesByKind(evidence, "description");
    const descriptionText = descriptionSources.map((source) => source.text).join("\n\n");
    const parseEvidence =
      descriptionSources.length > 0 && hasRichRecipeDescription(descriptionText) && hasRecipeInstructions(descriptionText)
        ? cloneEvidenceWithSources(evidence, [...descriptionSources, ...getSourcesByKind(evidence, "ocr")])
        : evidence;
    const parsed = await tryParseEvidence(app, parseEvidence, originalUrl);
    if (parsed.success) {
      evidence.diagnostics.stagesSkipped.push("audio_transcription");
      return { success: true, recipe: parsed.recipe, evidence, stage: "video_ocr" };
    }
    if (parsed.parsed?.error?.code !== "RECIPE_MODEL_NOT_FOUND") {
      return errorResult(parsed.parsed?.error?.code || "RECIPE_PARSE_FAILED", parsed.parsed?.error?.message || "Local recipe parsing failed.", {
        evidence,
        parserInput: parsed.parserInput,
      });
    }
  }

  if (validateVideoUrl(videoUrl)) {
    evidence.diagnostics.stagesRun.push("audio_transcription");
    const transcript = await runTranscription(app, {
      url: videoUrl,
    });
    if (transcript?.success) {
      evidence.language = transcript.language || evidence.language;
      addSource(evidence, "speech", transcript.text, { source: "faster_whisper" });
    } else {
      evidence.diagnostics.warnings.push({
        code: transcript?.error?.code || "AUDIO_TRANSCRIPTION_FAILED",
        message: transcript?.error?.message || "Audio transcription failed.",
      });
    }
  } else {
    evidence.diagnostics.stagesSkipped.push("audio_transcription");
  }

  assessment = assessEvidence(evidence);
  coverage = analyzeRecipeCoverage(evidence);
  evidence.diagnostics.assessments.push({ stage: "stage3_with_audio", ...assessment, coverage });
  if (coverage.notCookingRecipe || isNotCookingRecipeAssessment(assessment)) {
    return errorResult("NOT_A_COOKING_RECIPE", "Источник похож на учебный материал о рецептах, но не на кулинарный рецепт.", { evidence });
  }
  if (!coverage.sufficient) {
    return errorResult("RECIPE_TEXT_INSUFFICIENT", "Недостаточно данных для извлечения рецепта.", { evidence });
  }

  const parsed = await tryParseEvidence(app, evidence, originalUrl);
  if (parsed.success) return { success: true, recipe: parsed.recipe, evidence, stage: "audio_transcription" };
  return errorResult(parsed.parsed?.error?.code || "RECIPE_PARSE_FAILED", parsed.parsed?.error?.message || "Local recipe parsing failed.", {
    evidence,
    parserInput: parsed.parserInput,
  });
}

function registerVideoRecipePipelineIpc(ipcMain, app) {
  ipcMain.handle(IMPORT_VIDEO_RECIPE_LOCAL_CHANNEL, (_event, payload) => importVideoRecipeLocal(app, payload));
}

module.exports = {
  IMPORT_VIDEO_RECIPE_LOCAL_CHANNEL,
  analyzeRecipeCoverage,
  assessEvidence,
  buildParserInput,
  importVideoRecipeLocal,
  registerVideoRecipePipelineIpc,
  tryBuildIngredientSpeechRecipe,
};
