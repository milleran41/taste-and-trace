const http = require("http");
const https = require("https");
const { parseRecipeTextLocal } = require("./local-recipe-parser.cjs");

const IMPORT_ARTICLE_RECIPE_LOCAL_CHANNEL = "tasteTrace:importArticleRecipeLocal";
const MAX_PAGE_CHARS = 180000;
const MAX_PARSER_CHARS = 50000;

function errorResult(code, message, details = undefined) {
  return {
    success: false,
    error: { code, message },
    details,
  };
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

function cleanText(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSourceUrl(url) {
  return String(url || "").trim().replace(/[.,;:!?)]*$/u, "");
}

function normalizePlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host.split(".")[0] || "website";
  } catch {
    return "website";
  }
}

function fetchText(url, allowInsecureTls = false, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects."));
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      reject(new Error("Only http and https URLs are supported."));
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
          fetchText(redirectUrl, allowInsecureTls, redirectCount + 1).then(resolve, reject);
          return;
        }

        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          response.resume();
          reject(new Error(`Page request failed: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes <= MAX_PAGE_CHARS * 4) chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").slice(0, MAX_PAGE_CHARS)));
      },
    );
    request.setTimeout(30000, () => request.destroy(new Error("Page request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchHtml(url) {
  try {
    return await fetchText(url, false);
  } catch (error) {
    if (!String(error?.code || error?.message || "").match(/CERT|TLS|SSL|UNABLE_TO_VERIFY/i)) throw error;
    return fetchText(url, true);
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
        if (Array.isArray(item.itemListElement)) queue.push(...item.itemListElement);
      }
    } catch {
      // Ignore malformed structured data.
    }
  }
  return objects;
}

function typeIncludes(item, typeName) {
  const type = item?.["@type"];
  if (typeof type === "string") return type.toLowerCase() === typeName.toLowerCase();
  if (Array.isArray(type)) return type.some((value) => String(value).toLowerCase() === typeName.toLowerCase());
  return false;
}

function findJsonLdRecipe(html) {
  return extractJsonLdObjects(html).find((item) => typeIncludes(item, "Recipe")) || null;
}

function firstString(value) {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstString(item);
      if (text) return text;
    }
  }
  if (value && typeof value === "object") {
    return firstString(value.url) || firstString(value.contentUrl) || firstString(value["@id"]);
  }
  return "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(typeof item === "string" ? item : item?.text || item?.name || "")).filter(Boolean);
}

function extractInstructionText(value) {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.flatMap((item) => extractInstructionText(item)).filter(Boolean);
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.itemListElement)) return value.itemListElement.flatMap((item) => extractInstructionText(item)).filter(Boolean);
  return cleanText(value.text || value.name || "");
}

function normalizeDuration(value) {
  const text = firstString(value);
  if (!text) return "";
  const isoMatch = text.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!isoMatch) return text;
  const hours = Number.parseInt(isoMatch[1] || "0", 10);
  const minutes = Number.parseInt(isoMatch[2] || "0", 10);
  const parts = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);
  return parts.join(" ") || text;
}

function normalizeServings(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.round(value));
  const text = firstString(value);
  const match = text.match(/\d+/);
  return match ? Math.max(1, Number.parseInt(match[0], 10)) : null;
}

function recipeSearchText(recipe) {
  return [
    recipe.title,
    recipe.description,
    ...(recipe.ingredients || []),
    ...(recipe.instructions || []),
    ...(recipe.tags || []),
  ]
    .map((item) => String(item || ""))
    .join(" ")
    .toLowerCase();
}

function hasCyrillic(value) {
  return /[а-яё]/iu.test(value);
}

function inferCategoryHint(recipe) {
  const text = recipeSearchText(recipe);
  const title = String(recipe.title || "").toLowerCase();
  const ru = hasCyrillic(text);
  if (/\b(?:soup|broth|borscht|stew)\b|(?:суп|бульон|борщ|щи)/iu.test(title)) return ru ? "Первые блюда" : "Soups";
  if (/\b(?:steak|beef|pork|chicken|fish|salmon|main|entree|meat)\b|(?:говядин|свинин|куриц|рыб|стейк|мяс)/iu.test(title)) return ru ? "Вторые блюда" : "Main dishes";
  if (/\b(?:cake|cookie|dessert|ice cream|pudding|sweet)\b|(?:торт|печень|десерт|морожен|пудинг)/iu.test(text)) return ru ? "Десерты" : "Desserts";
  if (/\b(?:bread|bun|pie|pastry|dough|baked|quiche)\b|(?:хлеб|булоч|пирог|тесто|выпеч|киш)/iu.test(text)) return ru ? "Мучные изделия" : "Baked goods";
  if (/\b(?:steak|beef|pork|chicken|fish|salmon|main|entree|meat)\b|(?:говядин|свинин|куриц|рыб|стейк|мяс)/iu.test(text)) return ru ? "Вторые блюда" : "Main dishes";
  if (/\b(?:soup|broth|borscht|stew)\b|(?:суп|бульон|борщ|щи)/iu.test(text)) return ru ? "Первые блюда" : "Soups";
  if (/\b(?:drink|cocktail|smoothie|juice|tea|coffee)\b|(?:напит|коктейл|смузи|сок|чай|кофе)/iu.test(text)) return ru ? "Напитки" : "Drinks";
  return ru ? "Разное" : "Misc";
}

function normalizeCategoryHint(recipe) {
  const current = cleanText(recipe.category_hint || "");
  const text = recipeSearchText(recipe);
  const title = String(recipe.title || "").toLowerCase();
  if (!current) return inferCategoryHint(recipe);
  if (/^(?:drinks?|soups?|напитки|первые блюда)$/iu.test(current) && /\b(?:steak|beef|pork|chicken|fish|salmon|main|entree|meat)\b|(?:говядин|свинин|куриц|рыб|стейк|мяс)/iu.test(title)) {
    return inferCategoryHint({ ...recipe, category_hint: "" });
  }
  const currentWords = current.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const hasOverlap = currentWords.some((word) => word.length >= 4 && text.includes(word));
  const looksSpecificDish = /quiche|pizza|burger|cake|soup|salad|pasta|steak|киш|пицц|бургер|торт|суп|салат|паст|стейк/iu.test(current);
  return looksSpecificDish && !hasOverlap ? inferCategoryHint(recipe) : current;
}

function recipeFromJsonLd(item, url, html) {
  if (!item || typeof item !== "object") return null;

  const recipe = {
    title: firstString(item.name) || extractTitle(html) || "Imported recipe",
    description: firstString(item.description),
    ingredients: normalizeStringArray(item.recipeIngredient),
    instructions: extractInstructionText(item.recipeInstructions),
    cooking_time: normalizeDuration(item.totalTime) || normalizeDuration(item.cookTime) || normalizeDuration(item.prepTime),
    servings: normalizeServings(item.recipeYield || item.yield),
    difficulty: "medium",
    tags: normalizeStringArray(Array.isArray(item.keywords) ? item.keywords : String(item.keywords || "").split(/[,;]/u)),
    notes: "",
    category_hint: firstString(item.recipeCategory),
    thumbnail: firstString(item.image) || extractMetaContent(html, "og:image") || extractMetaContent(html, "twitter:image"),
    source: {
      sourceType: "article",
      sourceUrl: url,
      sourcePlatform: normalizePlatform(url),
    },
    localDraft: true,
  };

  recipe.category_hint = normalizeCategoryHint(recipe);
  if (!recipe.description) recipe.description = recipe.instructions[0] || recipe.title;
  if (!recipe.ingredients.length || !recipe.instructions.length) return null;
  return recipe;
}

function htmlToText(value) {
  return cleanText(
    String(value || "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|li|h[1-6]|div)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function extractListItems(html, options = {}) {
  const items = [];
  for (const match of String(html || "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const preferred = options.preferEm ? match[1].match(/<em\b[^>]*>([\s\S]*?)<\/em>/i)?.[1] : "";
    const text = htmlToText(preferred || match[1]);
    if (text.length >= 3) items.push(text);
  }
  return items;
}

function findHeadingIndex(html, names, startIndex = 0) {
  const patterns = names.map((name) => new RegExp(name, "iu"));
  const source = String(html || "");
  const headings = source.slice(startIndex).matchAll(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/giu);
  for (const match of headings) {
    const headingText = htmlToText(match[0]);
    if (patterns.some((pattern) => pattern.test(headingText))) {
      return startIndex + (match.index || 0);
    }
  }
  return -1;
}

function findNextHeadingIndex(html, startIndex = 0) {
  const match = String(html || "").slice(startIndex).match(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/iu);
  return match?.index === undefined ? -1 : startIndex + match.index;
}

function extractHtmlSection(html, headingNames, nextHeadingNames = []) {
  const start = findHeadingIndex(html, headingNames);
  if (start < 0) return "";
  const afterHeading = String(html).indexOf("</h", start);
  const bodyStart = afterHeading < 0 ? start : String(html).indexOf(">", afterHeading) + 1;
  const explicitEnd = nextHeadingNames.length ? findHeadingIndex(html, nextHeadingNames, bodyStart) : -1;
  const nextHeading = findNextHeadingIndex(html, bodyStart);
  const endCandidates = [explicitEnd, nextHeading].filter((index) => index > bodyStart);
  const end = endCandidates.length ? Math.min(...endCandidates) : String(html).length;
  return String(html).slice(bodyStart, end);
}

function parseServingsFromText(value) {
  const match = String(value || "").match(/serves?\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)|(\d{1,3})\s*(?:servings?|portions?)/iu);
  if (!match) return null;
  const wordNumbers = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const valueText = String(match[1] || match[2] || "").toLowerCase();
  return wordNumbers[valueText] || Number.parseInt(valueText, 10) || null;
}

function recipeFromHtmlSections(html, url) {
  const ingredientsSection = extractHtmlSection(html, ["Ingredients", "Ингредиенты"], ["Process", "Method", "Instructions", "Directions", "Notes?", "Discussion"]);
  const processSection = extractHtmlSection(html, ["Process", "Method", "Instructions", "Directions", "Приготовление", "Шаги"], ["Notes?", "Discussion"]);
  const ingredients = extractListItems(ingredientsSection, { preferEm: true }).slice(0, 80);
  const instructions = extractListItems(processSection).slice(0, 80);
  if (ingredients.length < 3 || instructions.length < 2) return null;

  const introHtml = String(html).slice(0, findHeadingIndex(html, ["Ingredients", "Ингредиенты"]));
  const description =
    htmlToText(introHtml)
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length >= 50 && !/javascript|subscribe|sign in|substack/iu.test(line)) ||
    extractMetaContent(html, "description") ||
    extractTitle(html);

  const combinedText = htmlToText(`${ingredientsSection}\n${processSection}`);
  const recipe = {
    title: extractTitle(html) || "Imported recipe",
    description,
    ingredients,
    instructions,
    cooking_time: "",
    servings: parseServingsFromText(combinedText),
    difficulty: "medium",
    tags: ["article", "draft"],
    notes: "",
    category_hint: "",
    thumbnail: extractMetaContent(html, "og:image") || extractMetaContent(html, "twitter:image") || "",
    source: {
      sourceType: "article",
      sourceUrl: url,
      sourcePlatform: normalizePlatform(url),
    },
    localDraft: true,
  };
  recipe.category_hint = normalizeCategoryHint(recipe);
  return recipe;
}

function extractReadablePageText(html) {
  return cleanText(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, " "),
  ).slice(0, MAX_PARSER_CHARS);
}

async function importArticleRecipeLocal(app, payload) {
  const url = normalizeSourceUrl(typeof payload === "string" ? payload : payload?.url);
  if (!url) return errorResult("INVALID_URL", "URL must be a non-empty string.");

  let html;
  try {
    html = await fetchHtml(url);
  } catch (error) {
    return errorResult("SOURCE_FETCH_FAILED", "Не удалось загрузить страницу. Проверьте ссылку и попробуйте снова.", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const structuredRecipe = recipeFromJsonLd(findJsonLdRecipe(html), url, html);
  if (structuredRecipe) {
    return {
      success: true,
      recipe: structuredRecipe,
      stage: "json_ld",
    };
  }

  const sectionRecipe = recipeFromHtmlSections(html, url);
  if (sectionRecipe) {
    return {
      success: true,
      recipe: sectionRecipe,
      stage: "html_sections",
    };
  }

  const text = extractReadablePageText(html);
  if (text.length < 100) {
    return errorResult("RECIPE_TEXT_INSUFFICIENT", "Недостаточно данных для извлечения рецепта.");
  }

  const parsed = await parseRecipeTextLocal(app, {
    text: [`TITLE:\n${extractTitle(html)}`, `PAGE TEXT:\n${text}`].filter(Boolean).join("\n\n"),
  });

  if (!parsed.success || !parsed.recipe) {
    return errorResult(parsed.error?.code || "RECIPE_PARSE_FAILED", parsed.error?.message || "Local recipe parsing failed.", {
      parserInput: text,
    });
  }

  return {
    success: true,
    recipe: {
      ...parsed.recipe,
      thumbnail: extractMetaContent(html, "og:image") || extractMetaContent(html, "twitter:image") || "",
      source: {
        sourceType: "article",
        sourceUrl: url,
        sourcePlatform: normalizePlatform(url),
      },
      localDraft: true,
      quality: parsed.quality,
    },
    stage: "local_parser",
  };
}

function registerArticleRecipePipelineIpc(ipcMain, app) {
  ipcMain.handle(IMPORT_ARTICLE_RECIPE_LOCAL_CHANNEL, (_event, payload) => importArticleRecipeLocal(app, payload));
}

module.exports = {
  IMPORT_ARTICLE_RECIPE_LOCAL_CHANNEL,
  importArticleRecipeLocal,
  registerArticleRecipePipelineIpc,
};
