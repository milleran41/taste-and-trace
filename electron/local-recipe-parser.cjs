const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_INPUT_CHARS = 60000;
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;
const MAX_STDERR_BYTES = 4 * 1024 * 1024;
const PARSE_RECIPE_TEXT_LOCAL_CHANNEL = "tasteTrace:parseRecipeTextLocal";
const PREPARE_RECIPE_MODEL_CHANNEL = "tasteTrace:prepareRecipeParserModel";
const TRANSLATE_RECIPE_LOCAL_CHANNEL = "tasteTrace:translateRecipeLocal";

const LLAMA_CPP_VERSION = "b10330";
const LLAMA_CPP_ARCHIVE = `llama-${LLAMA_CPP_VERSION}-bin-win-cpu-x64.zip`;
const MODEL_REPO = "Qwen/Qwen2.5-3B-Instruct-GGUF";
const MODEL_FILE = "qwen2.5-3b-instruct-q4_k_m.gguf";
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILE}`;
const MIN_MODEL_BYTES = 2_000_000_000;

const NEGATION_PATTERNS = [
  /\bdo\s+not\b/i,
  /\bdon't\b/i,
  /\bnever\b/i,
  /\bno\s+need\s+to\b/i,
  /\bavoid\b/i,
  /\bwithout\b/i,
  /\bnot\b/i,
  /(?:^|[^\p{L}\p{N}])РЅРµ\s+(?:РЅСѓР¶РЅРѕ|РЅР°РґРѕ|СЃР»РёРІР°Р№С‚Рµ|РґРѕР±Р°РІР»СЏР№С‚Рµ|РґРµР»Р°Р№С‚Рµ|РёСЃРїРѕР»СЊР·СѓР№С‚Рµ|РїРµСЂРµРјРµС€РёРІР°Р№С‚Рµ|РІР°СЂРёС‚Рµ|Р¶Р°СЂСЊС‚Рµ|Р·Р°РїРµРєР°Р№С‚Рµ|СЃР»РёРІР°С‚СЊ|РґРѕР±Р°РІР»СЏС‚СЊ|РґРµР»Р°С‚СЊ|РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ|РІР°СЂРёС‚СЊ|Р¶Р°СЂРёС‚СЊ|Р·Р°РїРµРєР°С‚СЊ)(?![\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])РЅРµ(?![\p{L}\p{N}])/iu,
  /\bnicht\b/i,
  /\bnicht\s+hinzuf(?:Гј|u)gen\b/i,
  /\bno\s+(?:escurras|agregues|aГ±adas|anadas)\b/i,
  /\bne\s+pas\b/i,
  /\bn['вЂ™]?\s*ajoutez\s+pas\b/i,
];

const QUANTITY_PATTERNS = [
  /\b\d+(?:[.,]\d+)?\s*(?:g|gram|grams|gramme|grammes|Рі|РіСЂ|РіСЂР°РјРј(?:РѕРІ|Р°)?|Gramm|kg|kilogram(?:s)?|РєРі)\b/giu,
  /\b\d+(?:[.,]\d+)?\s*(?:ml|milliliter(?:s)?|millilitre(?:s)?|РјР»|l|liter(?:s)?|litre(?:s)?|Р»|Milliliter)\b/giu,
  /\b\d+\s*\/\s*\d+\s*(?:teaspoon(?:s)?|tablespoon(?:s)?|tsp|tbsp|С‡Р°Р№(?:РЅРѕР№|РЅР°СЏ)?\s+Р»РѕР¶(?:РєРё|РєР°)|СЃС‚РѕР»РѕРІ(?:РѕР№|Р°СЏ)?\s+Р»РѕР¶(?:РєРё|РєР°))?\b/giu,
  /\b\d+(?:[.,]\d+)?\s*(?:cup(?:s)?|С‡Р°С€(?:РєРё|РєР°)|СЃС‚Р°РєР°РЅ(?:Р°|РѕРІ)?)\b/giu,
  /\b\d{2,3}\s*В°\s*[CFРЎ]?\b/giu,
  /\b\d{2,3}\s*(?:degrees?|РіСЂР°РґСѓСЃ(?:РѕРІ|Р°)?|Grad|Gramm)\b/giu,
  /\b\d+(?:[.,]\d+)?\s*(?:minute(?:s)?|min|hour(?:s)?|hr|С‡Р°СЃ(?:Р°|РѕРІ)?|РјРёРЅСѓС‚(?:Р°|С‹)?|Minuten|Stunden)\b/giu,
  /\b\d+(?:[.,]\d+)?\s*(?:serving(?:s)?|portion(?:s)?|РїРѕСЂС†Рё(?:СЏ|Рё|Р№)|Portion(?:en)?)\b/giu,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|a\s+couple\s+of)\s+(?:clove(?:s)?|egg(?:s)?|cup(?:s)?|teaspoon(?:s)?|tablespoon(?:s)?|minute(?:s)?|hour(?:s)?)\b/giu,
  /\b(?:РѕРґРёРЅ|РґРІР°|С‚СЂРё|С‡РµС‚С‹СЂРµ|РїСЏС‚СЊ|РїРѕР»РѕРІРёРЅР°)\s+(?:Р·СѓР±С‡РёРє(?:Р°|РѕРІ)?|СЏР№С†(?:Рѕ|Р°)?|Р»РѕР¶(?:РєР°|РєРё)|РјРёРЅСѓС‚(?:Р°|С‹)?)\b/giu,
];

const INGREDIENT_KEYWORDS = [
  "oil",
  "olive oil",
  "extra virgin olive oil",
  "garlic",
  "chilli",
  "chili",
  "basil",
  "basil stalks",
  "tomatoes",
  "tomato",
  "pasta",
  "lasagna sheets",
  "lasagne sheets",
  "peas",
  "tuna",
  "olives",
  "parmesan",
  "feta",
  "water",
  "salt",
  "pepper",
  "chicken",
  "chicken breast",
  "minced chicken",
  "ground chicken",
  "chicken mince",
  "keema",
  "beans",
  "chickpeas",
  "kidney beans",
  "green beans",
  "butternut squash",
  "mixed herbs",
  "curry powder",
  "garam masala",
  "turmeric",
  "cumin",
  "coriander",
  "chilli",
  "chili",
  "ginger",
  "tomato paste",
  "coconut milk",
  "stock",
  "cilantro",
  "flour",
  "milk",
  "eggs",
  "butter",
  "sugar",
  "РјСѓРєР°",
  "РјРѕР»РѕРєРѕ",
  "СЏР№С†Р°",
  "СЏР№С†Рѕ",
  "СЃРѕР»СЊ",
  "РјР°СЃР»Рѕ",
  "РІРѕРґР°",
  "С‡РµСЃРЅРѕРє",
  "РїРѕРјРёРґРѕСЂС‹",
  "С‚РѕРјР°С‚С‹",
  "Р±Р°Р·РёР»РёРє",
  "Nudeln",
  "Pasta",
  "Knoblauch",
  "Tomaten",
  "OlivenГ¶l",
  "Basilikum",
];

const RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["ok", "not_a_recipe", "insufficient_data"],
    },
    title: { type: "string" },
    description: { type: "string" },
    ingredients: {
      type: "array",
      items: { type: "string" },
    },
    instructions: {
      type: "array",
      items: { type: "string" },
    },
    cooking_time: { type: "string" },
    servings: {
      anyOf: [{ type: "integer" }, { type: "null" }],
    },
    difficulty: {
      type: "string",
      enum: ["easy", "medium", "hard"],
    },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
    category_hint: { type: "string" },
  },
  required: [
    "status",
    "title",
    "description",
    "ingredients",
    "instructions",
    "cooking_time",
    "servings",
    "difficulty",
    "tags",
    "notes",
    "category_hint",
  ],
};

class LocalRecipeParserError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "LocalRecipeParserError";
    this.code = code;
    this.details = details;
  }
}

function errorResult(code, message, details) {
  return {
    success: false,
    error: { code, message },
    ...(details ? { details } : {}),
  };
}

function okResult(recipe, metadata) {
  return {
    success: true,
    recipe,
    ...metadata,
  };
}

function uniqueExistingFiles(candidates) {
  const result = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      result.push(resolved);
    }
  }

  return result;
}

function getAppPath(app) {
  return app && typeof app.getAppPath === "function" ? app.getAppPath() : path.resolve(__dirname, "..");
}

function getUserDataPath(app) {
  if (app && typeof app.getPath === "function") {
    return app.getPath("userData");
  }
  return path.join(process.env.APPDATA || path.join(process.cwd(), ".taste-trace-user-data"), "taste-and-trace");
}

function getUserDataPathCandidates(app) {
  const appData = process.env.APPDATA || path.join(process.cwd(), ".taste-trace-user-data");
  const candidates = [
    getUserDataPath(app),
    path.join(appData, "taste-and-trace"),
    path.join(appData, "Taste & Trace"),
    path.join(appData, "taste-and-trace-desktop"),
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });
}

function getRecipeParserModelDirectory(app) {
  return path.join(getUserDataPath(app), "models", "recipe-parser");
}

function getLlamaRuntimeCacheDirectory(app) {
  return path.join(getUserDataPath(app), "runtime", "llama.cpp", LLAMA_CPP_VERSION);
}

function getDefaultModelPath(app) {
  return path.join(getRecipeParserModelDirectory(app), MODEL_FILE);
}

function getRecipeParserModelPathCandidates(app) {
  return getUserDataPathCandidates(app).map((userDataPath) => path.join(userDataPath, "models", "recipe-parser", MODEL_FILE));
}

function getLlamaRuntimePathCandidates(app) {
  return getUserDataPathCandidates(app).flatMap((userDataPath) => {
    const runtimeDir = path.join(userDataPath, "runtime", "llama.cpp", LLAMA_CPP_VERSION);
    return [
      path.join(runtimeDir, "llama-cli.exe"),
      path.join(runtimeDir, "llama.exe"),
    ];
  });
}

function getBundledLlamaArchivePath(app) {
  const appPath = getAppPath(app);
  const executableDir = path.dirname(process.execPath);
  const resourcesPath = process.resourcesPath || "";
  const candidates = uniqueExistingFiles([
    path.join(appPath, "electron", "llama.cpp", LLAMA_CPP_ARCHIVE),
    path.join(appPath, "llama.cpp", LLAMA_CPP_ARCHIVE),
    path.join(resourcesPath, "llama.cpp", LLAMA_CPP_ARCHIVE),
    path.join(executableDir, "resources", "llama.cpp", LLAMA_CPP_ARCHIVE),
  ]);
  return candidates[0] || null;
}

function resolveLlamaRuntime(app) {
  const appPath = getAppPath(app);
  const executableDir = path.dirname(process.execPath);
  const resourcesPath = process.resourcesPath || "";
  const envPath = process.env.LLAMA_CPP_PATH || process.env.RECIPE_PARSER_LLAMA_PATH;
  const cachedRuntimeDir = getLlamaRuntimeCacheDirectory(app);
  const cacheCandidates = getLlamaRuntimePathCandidates(app);

  const candidates = uniqueExistingFiles([
    envPath,
    path.join(appPath, "electron", "llama.cpp", "llama-cli.exe"),
    path.join(appPath, "llama.cpp", "llama-cli.exe"),
    path.join(cachedRuntimeDir, "llama-cli.exe"),
    ...cacheCandidates,
    path.join(resourcesPath, "llama.cpp", "llama-cli.exe"),
    path.join(executableDir, "resources", "llama.cpp", "llama-cli.exe"),
    path.join(cachedRuntimeDir, "llama.exe"),
  ]);

  if (!candidates.length) {
    return {
      ok: false,
      message: "Local llama.cpp runtime was not found.",
      searched: [
        envPath,
        path.join(appPath, "electron", "llama.cpp", "llama-cli.exe"),
        path.join(appPath, "llama.cpp", "llama-cli.exe"),
        path.join(cachedRuntimeDir, "llama-cli.exe"),
        ...cacheCandidates,
        path.join(resourcesPath, "llama.cpp", "llama-cli.exe"),
        path.join(executableDir, "resources", "llama.cpp", "llama-cli.exe"),
        path.join(cachedRuntimeDir, "llama.exe"),
      ].filter(Boolean),
    };
  }

  const executablePath = candidates[0];
  const isLauncher = path.basename(executablePath).toLowerCase() === "llama.exe";

  return {
    ok: true,
    executablePath,
    launcherArgs: isLauncher ? ["cli"] : [],
    runtimeDir: path.dirname(executablePath),
  };
}

function extractZipWithPowerShell(archivePath, targetDir) {
  return new Promise((resolve, reject) => {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(targetDir)} -Force`,
    ].join("; ");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr, "utf8") > MAX_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_STDERR_BYTES);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Expand-Archive failed with code ${code}.`));
    });
  });
}

async function ensureLlamaRuntime(app) {
  const runtime = resolveLlamaRuntime(app);
  if (runtime.ok) return runtime;

  const archivePath = getBundledLlamaArchivePath(app);
  if (!archivePath) return runtime;

  const targetDir = getLlamaRuntimeCacheDirectory(app);
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    await extractZipWithPowerShell(archivePath, targetDir);
  } catch (error) {
    return {
      ok: false,
      message: "Local llama.cpp runtime could not be extracted.",
      searched: runtime.searched,
      archivePath,
      targetDir,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const extractedRuntime = resolveLlamaRuntime(app);
  return extractedRuntime.ok
    ? extractedRuntime
    : {
        ok: false,
        message: "Local llama.cpp runtime archive did not contain llama-cli.exe.",
        searched: extractedRuntime.searched,
        archivePath,
        targetDir,
      };
}

function resolveRecipeModel(app) {
  const envPath = process.env.RECIPE_PARSER_MODEL || process.env.RECIPE_MODEL_PATH;
  const defaultPath = getDefaultModelPath(app);
  const modelCandidates = getRecipeParserModelPathCandidates(app);
  const candidates = uniqueExistingFiles([envPath, defaultPath, ...modelCandidates]);

  if (!candidates.length) {
    return {
      ok: false,
      message: "Local recipe parser model was not found.",
      expectedPath: defaultPath,
      searched: [envPath, defaultPath, ...modelCandidates].filter(Boolean),
      downloadUrl: MODEL_URL,
    };
  }

  const modelPath = candidates[0];
  const size = fs.statSync(modelPath).size;
  if (size < MIN_MODEL_BYTES) {
    return {
      ok: false,
      message: "Local recipe parser model looks incomplete.",
      expectedPath: defaultPath,
      foundPath: modelPath,
      size,
    };
  }

  return { ok: true, modelPath, size };
}

function normalizeDifficulty(value) {
  if (value === "easy" || value === "medium" || value === "hard") return value;
  return "medium";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniquePush(list, item, keyFn = (value) => value) {
  const key = keyFn(item);
  if (!key) return;
  if (!list.some((existing) => keyFn(existing) === key)) list.push(item);
}

function extractMatchesFromSentence(sentence, patterns) {
  const matches = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of sentence.matchAll(pattern)) {
      uniquePush(matches, (match[1] || match[0]).trim(), normalizeComparable);
    }
  }
  return matches;
}

function extractTranscriptEvidence(text) {
  const sentences = splitSentences(text);
  const numeric = [];
  const negations = [];
  const ingredients = [];

  for (const sentence of sentences) {
    const quantityMatches = extractMatchesFromSentence(sentence, QUANTITY_PATTERNS);
    if (quantityMatches.length > 0) {
      uniquePush(
        numeric,
        {
          text: sentence,
          matches: quantityMatches,
        },
        (item) => normalizeComparable(item.text),
      );
    }

    if (NEGATION_PATTERNS.some((pattern) => pattern.test(sentence))) {
      uniquePush(
        negations,
        {
          text: sentence,
          keywords: extractActionKeywords(sentence),
        },
        (item) => normalizeComparable(item.text),
      );
    }

    for (const keyword of INGREDIENT_KEYWORDS) {
      if (normalizedTextHasTerm(normalizeComparable(sentence), keyword)) {
        uniquePush(ingredients, { name: keyword, text: sentence }, (item) => normalizeComparable(item.name));
      }
    }
  }

  return {
    numeric,
    negations,
    ingredients,
    stats: {
      sentences: sentences.length,
      transcript_chars: String(text || "").trim().length,
    },
  };
}

function truncatePromptEvidenceText(value, maxLength = 220) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}

function formatEvidenceForPrompt(evidence) {
  const numeric = evidence.numeric
    .slice(0, 16)
    .map((item) => `- ${item.matches.slice(0, 6).join(", ")} :: ${truncatePromptEvidenceText(item.text)}`)
    .join("\n") || "- none";
  const negations = evidence.negations
    .slice(0, 8)
    .map((item) => `- ${truncatePromptEvidenceText(item.text)}`)
    .join("\n") || "- none";
  const ingredients = evidence.ingredients
    .slice(0, 18)
    .map((item) => `- ${item.name} :: ${truncatePromptEvidenceText(item.text)}`)
    .join("\n") || "- none";

  return `NUMERIC / QUANTITY / TIME / TEMPERATURE EVIDENCE:
${numeric}

NEGATION / DO-NOT / CAUTION EVIDENCE:
${negations}

INGREDIENT-LIKE EVIDENCE:
${ingredients}`;
}

function extractNumbersAndUnits(value) {
  return extractMatchesFromSentence(String(value || ""), QUANTITY_PATTERNS);
}

function sourceContains(sourceText, value) {
  const normalizedSource = normalizeComparable(sourceText);
  const normalizedValue = normalizeComparable(value);
  if (!normalizedValue) return true;
  if (normalizedSource.includes(normalizedValue)) return true;
  if (normalizedValue.endsWith("s") && normalizedSource.includes(normalizedValue.slice(0, -1))) return true;
  if (normalizedSource.includes(`${normalizedValue}s`)) return true;

  const compactSource = normalizedSource.replace(/\s+/g, "");
  const compactValue = normalizedValue.replace(/\s+/g, "");
  if (compactValue && compactSource.includes(compactValue)) return true;

  const numericParts = normalizedValue.match(/\d+(?:[.,]\d+)?/g) || [];
  if (numericParts.length > 0) {
    return numericParts.every((part) => normalizedSource.includes(part.replace(",", ".")) || normalizedSource.includes(part.replace(".", ",")));
  }

  return false;
}

function normalizedTextHasTerm(normalizedText, term) {
  const normalizedTerm = normalizeComparable(term);
  if (!normalizedTerm) return false;
  const tokens = normalizedTerm.split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && tokens[0].length < 4) {
    return normalizedText.split(/\s+/).includes(tokens[0]);
  }
  return normalizedText.includes(normalizedTerm);
}

function extractActionKeywords(text) {
  const normalized = normalizeComparable(text);
  const candidates = [
    "drain",
    "steam",
    "add",
    "boil",
    "cook",
    "fry",
    "bake",
    "mix",
    "blend",
    "sieve",
    "СЃР»РёРІР°Р№С‚Рµ",
    "СЃР»РёС‚СЊ",
    "РґРѕР±Р°РІР»СЏР№С‚Рµ",
    "РґРѕР±Р°РІРёС‚СЊ",
    "РІР°СЂРёС‚СЊ",
    "Р¶Р°СЂРёС‚СЊ",
    "abgieГџen",
    "abgiessen",
    "hinzufГјgen",
    "escurras",
    "escurrir",
    "Г©goutter",
    "egoutter",
  ];
  return candidates.filter((candidate) => normalized.includes(normalizeComparable(candidate)));
}

function warning(code, message, details = {}) {
  return { code, message, ...details };
}

function detectUnsupportedQuantities(recipe, sourceText) {
  const warnings = [];
  const fields = [
    { field: "ingredients", values: recipe.ingredients },
    { field: "instructions", values: recipe.instructions },
    { field: "cooking_time", values: [recipe.cooking_time] },
    { field: "notes", values: [recipe.notes] },
  ];

  if (recipe.servings !== null && !sourceContains(sourceText, String(recipe.servings))) {
    warnings.push(warning("UNSUPPORTED_QUANTITY", "Servings value is not directly supported by the transcript.", {
      field: "servings",
      value: recipe.servings,
    }));
  }

  for (const item of fields) {
    for (const value of item.values) {
      for (const quantity of extractNumbersAndUnits(value)) {
        if (!sourceContains(sourceText, quantity)) {
          warnings.push(warning("UNSUPPORTED_QUANTITY", "Numeric fact is not directly supported by the transcript.", {
            field: item.field,
            value: quantity,
            text: value,
          }));
        }
      }
    }
  }

  return warnings;
}

function ingredientSupported(ingredient, sourceText) {
  const normalizedIngredient = normalizeComparable(ingredient);
  if (!normalizedIngredient) return true;
  if (sourceContains(sourceText, ingredient)) return true;

  const tokens = normalizedIngredient.split(/\s+/).filter((token) => token.length >= 4 && !/^\d+$/.test(token));
  if (tokens.length === 0) return true;
  const source = normalizeComparable(sourceText);
  return tokens.some((token) => source.includes(token));
}

function detectIngredientWarnings(recipe, sourceText, evidence) {
  const warnings = [];
  const recipeIngredientText = normalizeComparable(recipe.ingredients.join(" "));
  const recipeAllText = normalizeComparable([
    ...recipe.ingredients,
    ...recipe.instructions,
    recipe.notes,
    recipe.description,
  ].join(" "));

  for (const ingredient of recipe.ingredients) {
    if (!ingredientSupported(ingredient, sourceText)) {
      warnings.push(warning("UNSUPPORTED_INGREDIENT", "Ingredient is not clearly mentioned in the transcript.", { ingredient }));
    }
  }

  for (const item of evidence.ingredients) {
    const key = normalizeComparable(item.name);
    if (!key || key.length < 3) continue;
    if (!recipeIngredientText.includes(key) && !recipeAllText.includes(key)) {
      warnings.push(warning("POSSIBLE_MISSING_INGREDIENT", "Transcript mentions an ingredient-like item that is missing from the recipe output.", {
        ingredient: item.name,
        evidence: item.text,
      }));
    }
  }

  return warnings;
}

function detectNegationConflicts(recipe, evidence, sourceText) {
  const warnings = [];
  const instructions = recipe.instructions || [];

  for (const negation of evidence.negations) {
    const negationKeywords = negation.keywords.length ? negation.keywords : extractActionKeywords(negation.text);
    if (!negationKeywords.length) continue;

    for (const instruction of instructions) {
      const normalizedInstruction = normalizeComparable(instruction);
      if (NEGATION_PATTERNS.some((pattern) => pattern.test(instruction))) continue;
      const matched = negationKeywords.filter((keyword) => normalizedInstruction.includes(normalizeComparable(keyword)));
      if (matched.length > 0) {
        warnings.push(warning("NEGATION_CONFLICT", "Generated instruction may contradict a negative instruction in the transcript.", {
          instruction,
          evidence: negation.text,
          matched_keywords: matched,
        }));
      }
    }
  }

  const source = normalizeComparable(sourceText);
  if (source.includes("drain") && source.includes("claggy")) {
    for (const instruction of instructions) {
      const normalizedInstruction = normalizeComparable(instruction);
      if (normalizedInstruction.includes("drain") && !normalizedInstruction.includes("do not")) {
        warnings.push(warning("NEGATION_CONFLICT", "Generated pasta-draining instruction conflicts with transcript caution about draining/steaming pasta.", {
          instruction,
          evidence: "Source transcript discusses draining pasta in a colander and becoming claggy.",
          matched_keywords: ["drain", "claggy"],
        }));
      }
    }
  }

  return warnings;
}

function assessQuality(recipe, evidence, warnings) {
  const severe = warnings.filter((item) => item.code === "NEGATION_CONFLICT").length;
  const unsupported = warnings.filter((item) => item.code === "UNSUPPORTED_QUANTITY" || item.code === "UNSUPPORTED_INGREDIENT").length;
  const missing = warnings.filter((item) => item.code === "POSSIBLE_MISSING_INGREDIENT").length;
  const factCount = (recipe.ingredients?.length || 0) + (recipe.instructions?.length || 0);

  let score = "high";
  if (severe > 0 || unsupported >= 2 || factCount < 4) {
    score = "low";
  } else if (unsupported > 0 || missing >= 3 || evidence.stats.transcript_chars < 300) {
    score = "medium";
  }

  return {
    score,
    needs_review: score !== "high" || warnings.length > 0,
    warnings,
    evidence_counts: {
      numeric: evidence.numeric.length,
      negations: evidence.negations.length,
      ingredient_like: evidence.ingredients.length,
    },
  };
}

function buildQualityReport(recipe, sourceText, evidence) {
  const warnings = [
    ...detectUnsupportedQuantities(recipe, sourceText),
    ...detectIngredientWarnings(recipe, sourceText, evidence),
    ...detectNegationConflicts(recipe, evidence, sourceText),
  ];
  return assessQuality(recipe, evidence, warnings);
}

function extractSection(text, heading) {
  const pattern = new RegExp(`(?:^|\\n)\\s*${heading}:\\s*\\n([\\s\\S]*?)(?=\\n\\s*[A-Z][A-Z\\s]+:\\s*\\n|$)`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function lightlyNormalizeSourceText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[вЂђвЂ‘вЂ’вЂ“вЂ”вЂ•]/g, " - ")
    .replace(/(\d)(?=[\p{L}])/gu, "$1 ")
    .replace(/(?<=[\p{L}])(\d)/gu, " $1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitDenseIngredientLine(line) {
  const normalized = lightlyNormalizeSourceText(line);
  if (!normalized) return [];

  const quantityPattern =
    /(?<![\p{L}])(?:\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?|\d+\s*\/\s*\d+|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|РїСЏС‚СЊСЃРѕС‚|С‡РµС‚С‹СЂРµСЃС‚Р°|С‚СЂРёСЃС‚Р°|РґРІРµСЃС‚Рё|РґРµСЃСЏС‚СЊ|РґРµРІСЏС‚СЊ|РІРѕСЃРµРјСЊ|СЃРµРјСЊ|С€РµСЃС‚СЊ|РїСЏС‚СЊ|С‡РµС‚С‹СЂРµ|РѕРґРёРЅ|РѕРґРЅР°|РґРІР°|РґРІРµ|С‚СЂРё|СЃС‚Рѕ|РїРѕР»(?:РѕРІРёРЅР°)?|ein|eine|zwei|drei|vier|fuenf|fГјnf|sechs|sieben|acht|neun|zehn|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:(?:РєРі|kg|РіСЂР°РјРј(?:РѕРІ|Р°)?|РіСЂ|РјРёР»Р»РёР»РёС‚СЂ(?:РѕРІ|Р°)?|РјР»|Р»РёС‚СЂ(?:Р°|РѕРІ)?|Р»|С€С‚СѓРє(?:Рё)?|С€С‚\.?|СЏР№С†(?:Р°|Рѕ)?|Рі|g|gram|grams|gramm|ml|l|liter(?:s)?|litre(?:s)?|СЃС‚\.?\s*Р»\.?|tbsp|tablespoon(?:s)?|С‡\.?\s*Р»\.?|tsp|teaspoon(?:s)?|pcs?|eggs?|eier|huevos|oeufs|РІРµС‚Рє(?:Р°|Рё)?|Р·СѓР±С‡РёРє(?:Р°|РѕРІ)?|clove(?:s)?)(?=$|[^\p{L}]))?/giu;

  const matches = [...normalized.matchAll(quantityPattern)]
    .map((match) => ({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, text: match[0].trim() }))
    .filter((match) => /\d|one|two|three|four|five|six|seven|eight|nine|ten|РѕРґРёРЅ|РѕРґРЅР°|РґРІР°|РґРІРµ|С‚СЂРё|С‡РµС‚С‹СЂРµ|РїСЏС‚СЊ|СЃС‚Рѕ|РґРІРµСЃС‚Рё|С‚СЂРёСЃС‚Р°|С‡РµС‚С‹СЂРµСЃС‚Р°|РїСЏС‚СЊСЃРѕС‚|ein|eine|zwei|drei|uno|una|dos|un|une|deux/i.test(match.text));

  if (matches.length < 2) return [normalized];

  const clauses = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const previousEnd = index > 0 ? matches[index - 1].end : 0;
    const nextStart = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const before = normalized.slice(previousEnd, current.index).trim();
    const after = normalized.slice(current.end, nextStart).trim();
    const beforeTokens = before.split(/\s+/).filter(Boolean);
    const afterTokens = after.split(/\s+/).filter(Boolean);
    const actionTokenIndex = afterTokens.findIndex((token) =>
      /^(?:add|boil|cook|fry|bake|mix|stir|knead|simmer|roast|СЃРјРµС€|РІС‹РїРµРє|РІР°СЂ|Р¶Р°СЂ|С‚СѓС€|РґРѕР±Р°РІ|РіРѕС‚РѕРІ|РЅР°СЂРµР¶|mezclar|hornear|mischen|backen|mГ©langer|melanger|cuire)$/iu.test(token)
    );
    const ingredientAfterTokens = actionTokenIndex >= 0 ? afterTokens.slice(0, actionTokenIndex) : afterTokens;

    let clause = "";
    if (beforeTokens.length > 0) {
      clause = `${beforeTokens.slice(-5).join(" ")} ${current.text}`.trim();
    } else {
      clause = `${current.text} ${ingredientAfterTokens.slice(0, 5).join(" ")}`.trim();
    }
    if (clause && clause.length <= 140) clauses.push(clause);
  }

  return clauses.length ? clauses : [normalized];
}

function buildCandidateRecipeLines(text) {
  const rawLines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n|[;пј›]+/)
    .map((line) => line.replace(/^\s*\[\d{1,2}:\d{2}(?::\d{2})?]\s*/, "").trim())
    .filter(Boolean);
  const result = [];
  for (const line of rawLines.length ? rawLines : [String(text || "")]) {
    const splitLines = splitDenseIngredientLine(line);
    result.push(...splitLines);
  }
  return result;
}

function trimIngredientPhrase(value) {
  const cleaned = String(value || "")
    .replace(/^\s*[-*вЂўв–Є]\s*/, "")
    .replace(/\s+(?:I\s+buy|I\s+used|You\s+can|Can\s+also|Can\s+even|Please\s+|Recipe\s+For|Recipe\s+for|Serve\s+over)\b[\s\S]*$/iu, "")
    .replace(/\.\s+[\s\S]*$/u, "")
    .replace(/\s+(?:add|boil|cook|fry|bake|mix|stir|knead|simmer|roast|СЃРјРµС€Р°С‚СЊ|СЃРјРµС€Р°Р№С‚Рµ|РІС‹РїРµРєР°С‚СЊ|РІС‹РїРµРєР°Р№С‚Рµ|РІР°СЂРёС‚СЊ|Р¶Р°СЂРёС‚СЊ|С‚СѓС€РёС‚СЊ|РґРѕР±Р°РІРёС‚СЊ|РіРѕС‚РѕРІРёС‚СЊ|РЅР°СЂРµР·Р°С‚СЊ|mezclar|hornear|mischen|backen|mГ©langer|melanger|cuire)(?:$|\s+.*$)/iu, "")
    .replace(/\s*\([^)]*$/u, "")
    .trim();
  return /^\d+\s*:?\s*$/u.test(cleaned) ? "" : cleaned;
}

function isServiceOrSeoLine(line) {
  const cleaned = String(line || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return true;
  if (/^\d{1,2}:\d{2}(?::\d{2})?\b/u.test(cleaned)) return true;
  if (/https?:\/\/|www\.|youtube\.com|youtu\.be|playlist|channel|email|facebook|instagram|tiktok|background music|disclaimer/iu.test(cleaned)) return true;
  if (/(?:бесплатн\p{L}*\s+доставк|приве[дз][её]м\s+бесплат|привезем\s+ингредиенты|соцсетях|телеграм|интернет-магазин)/iu.test(cleaned)) return true;
  if (/^(?:title|description|captions?|transcript)\s*:/iu.test(cleaned)) return true;
  if (/#/.test(cleaned)) return true;
  if (/\b(?:no[-\s]?talking\s+asmr\s+cooking\s+video|natural\s+sounds|pure\s+food\s+relaxation|best\s+destination|develop\s+your\s+cooking\s+skills|if\s+you\s+love\s+to\s+cook|thanks\s+for\s+watching|subscribe|follow\s+us|youtube\s+channel|tik\s*tok|newsletter|cookbooks?|mini\s+course|free\s+pdf|go\s+and\s+order|you\s+will\s+not\s+be\s+disappointed)\b/iu.test(cleaned)) return true;
  const seoMatches = cleaned.match(/\b(?:asmr|recipe|recipes|cooking|breakfast|budget|relaxing|sounds?|video|videos?|notalking|no\s+talking|food\s+asmr|quick\s+meals|easy\s+cooking)\b/giu) || [];
  return seoMatches.length >= 4;
}

function isOcrCodeFragment(line) {
  const cleaned = String(line || "").replace(/\s+/g, " ").trim();
  if (!/^[a-z]{1,8}(?:\s+[a-z]{1,4})?\s+\d+$/iu.test(cleaned)) return false;
  return !/(?:potato(?:es)?|salt|pepper|flour|sugar|milk|cream|butter|egg(?:s)?|onion|carrot|tomato|rice|beans|garlic|cheese|РєР°СЂС‚РѕС„|СЃРѕР»СЊ|РїРµСЂРµС†|РјСѓРєР°|СЃР°С…Р°СЂ|РјРѕР»РѕРєРѕ|СЃР»РёРІРє|РјР°СЃР»Рѕ|СЏР№С†|Р»СѓРє|РјРѕСЂРєРѕРІ|С‚РѕРјР°С‚|СЂРёСЃ|С„Р°СЃРѕР»|С‡РµСЃРЅРѕРє|СЃС‹СЂ)/iu.test(cleaned);
}

function normalizeSparseFoodLine(line) {
  const cleaned = String(line || "")
    .replace(/^\s*\[\d{1,2}:\d{2}(?::\d{2})?]\s*/, "")
    .replace(/[|_[\]{}\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim(" .,:;~`'\"");
  const normalized = normalizeComparable(cleaned);
  if (!normalized || normalized.length < 4) return "";
  if (isServiceOrSeoLine(cleaned) || isOcrCodeFragment(cleaned)) return "";
  const spokenFoodWordPattern = /(?:chicken|breast|keema|mince|ground|beans?|chickpeas?|squash|herbs?|oil|salt|pepper|curry|masala|turmeric|cumin|coriander|chilli|chili|ginger|stock|cilantro|flour|sugar|milk|cream|butter|egg|potato|onion|carrot|tomato|rice|garlic|cheese)/iu;
  if (spokenFoodWordPattern.test(cleaned)) return cleaned;

  const corrections = [
    { pattern: /СЃР»РёРІРє/i, value: "РЎР»РёРІРєРё" },
    { pattern: /(?:РґРµС‚СЃРє|РµС‚СЃРє).{0,8}РїСЋСЂРµ/i, value: "Р”РµС‚СЃРєРѕРµ РїСЋСЂРµ" },
    { pattern: /РїСЋСЂРµ/i, value: "РџСЋСЂРµ" },
    { pattern: /РјРѕСЂРѕР¶РµРЅ/i, value: "РњРѕСЂРѕР¶РµРЅРѕРµ" },
  ];
  for (const correction of corrections) {
    if (correction.pattern.test(normalized)) return correction.value;
  }

  const foodWordPattern =
    /(?:РјСѓРєР°|СЃР°С…Р°СЂ|СЃРѕР»СЊ|РїРµСЂРµС†|РјРѕР»РѕРєРѕ|СЃР»РёРІРє|РјР°СЃР»Рѕ|СЏР№С†|РєР°СЂС‚РѕС„|Р»СѓРє|РјРѕСЂРєРѕРІ|РєР°РїСѓСЃС‚|С‚РѕРјР°С‚|РїРѕРјРёРґРѕСЂ|СЃРІ[РµС‘]РєР»|СЂРёСЃ|С„Р°СЃРѕР»|С‡РµСЃРЅРѕРє|Р·РµР»РµРЅСЊ|СѓРєСЂРѕРї|РїРµС‚СЂСѓС€|РєРёРЅР·|РіРѕРІСЏРґРёРЅ|РєСѓСЂРёС†|СЂС‹Р±|СЃС‹СЂ|С‚РІРѕСЂРѕРі|СЃРјРµС‚Р°РЅ|РїСЋСЂРµ|РјРѕСЂРѕР¶РµРЅ|flour|sugar|salt|pepper|milk|cream|butter|egg|potato|onion|carrot|tomato|rice|beans|garlic|cheese)/iu;
  if (!foodWordPattern.test(cleaned)) return "";
  if (cleaned.length > 60) return "";
  return cleaned;
}

function collectSparseFoodIngredients(lines) {
  const ingredients = [];
  const seen = new Set();
  for (const line of lines) {
    const ingredient = normalizeSparseFoodLine(line);
    if (!ingredient) continue;
    const key = normalizeComparable(ingredient);
    if (seen.has(key)) continue;
    seen.add(key);
    ingredients.push(ingredient);
  }
  return ingredients;
}

function cleanSpokenIngredientPhrase(value) {
  const cleaned = String(value || "")
    .replace(/\b(?:we\s+have|we've\s+got|we\s+got|you've\s+got|you\s+have|and\s+then|and\s+that's|that's|your|some|single|trimmed|cubed|a\s+tiny\s+little\s+bit\s+of|a\s+little\s+bit\s+of|of\s+course)\b/giu, " ")
    .replace(/\b(?:three|four|five)\s+main\s+food\s+ingredients?\b/giu, " ")
    .replace(/\b(?:ingredients?|recipe|food|main|away\s+from)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim(" .,:;~`'\"");
  if (!cleaned || cleaned.length < 3 || cleaned.length > 80) return "";
  if (isServiceOrSeoLine(cleaned) || isOcrCodeFragment(cleaned)) return "";
  if (!/(?:chicken|breast|beans?|squash|herbs?|oil|salt|pepper|flour|sugar|milk|cream|butter|egg|potato|onion|carrot|tomato|rice|garlic|cheese|РєСѓСЂРёС†|С„Р°СЃРѕР»|РјР°СЃР»|СЃРѕР»СЊ|РїРµСЂРµС†)/iu.test(cleaned)) return "";
  return cleaned;
}

function extractSpokenIngredientsFromTranscript(transcriptSection) {
  const normalized = lightlyNormalizeSourceText(transcriptSection);
  if (!normalized) return [];

  const startMatch = normalized.match(/\b(?:so\s+the\s+ingredients|ingredients?(?:\s+are)?|РёРЅРіСЂРµРґРёРµРЅС‚С‹)\b/i);
  if (!startMatch || typeof startMatch.index !== "number") return [];

  const afterStart = normalized.slice(startMatch.index + startMatch[0].length);
  const stopMatch = afterStart.match(/\b(?:so\s+let(?:'|вЂ™)s\s+get\s+started|let(?:'|вЂ™)s\s+get\s+started|first\s+of\s+all|РЅР°С‡РЅРµРј|РїСЂРёСЃС‚СѓРїРёРј)\b/i);
  const block = (stopMatch ? afterStart.slice(0, stopMatch.index) : afterStart.slice(0, 900)).replace(/\band\s+then\b/giu, ",");
  const knownIngredientPatterns = [
    /\b(?:single\s+)?chicken breast\b/iu,
    /\b(?:minced|ground)\s+chicken\b/iu,
    /\bchicken mince\b/iu,
    /\bchicken keema\b/iu,
    /\bkeema\b/iu,
    /\b(?:canned\s+)?beans\b/iu,
    /\bchickpeas\b/iu,
    /\bkidney beans\b/iu,
    /\bcubed butternut squash\b/iu,
    /\bbutternut squash\b/iu,
    /\btrimmed green beans\b/iu,
    /\bgreen beans\b/iu,
    /\bmixed herbs\b/iu,
    /\bolive oil\b/iu,
    /\bsalt and pepper\b/iu,
    /\bsalt\b/iu,
    /\bpepper\b/iu,
    /\bcurry powder\b/iu,
    /\bgaram masala\b/iu,
    /\bturmeric\b/iu,
    /\bcumin\b/iu,
    /\bground coriander\b/iu,
    /\bcoriander\b/iu,
    /\bchilli powder\b/iu,
    /\bchili powder\b/iu,
    /\bginger\b/iu,
    /\btomato paste\b/iu,
    /\bcoconut milk\b/iu,
    /\bchicken stock\b/iu,
    /\bstock\b/iu,
    /\bcilantro\b/iu,
    /\bflour\b/iu,
    /\bmilk\b/iu,
    /\beggs?\b/iu,
    /\bbutter\b/iu,
    /\bsugar\b/iu,
    /\bpotatoes?\b/iu,
    /\bonions?\b/iu,
    /\bcarrots?\b/iu,
    /\btomatoes?\b/iu,
    /\brice\b/iu,
    /\bgarlic\b/iu,
    /\bcheese\b/iu,
  ];

  const found = [];
  for (const pattern of knownIngredientPatterns) {
    const match = block.match(pattern);
    if (match && typeof match.index === "number") {
      found.push({ index: match.index, text: cleanSpokenIngredientPhrase(match[0]) || match[0].trim() });
    }
  }
  found.sort((left, right) => left.index - right.index);

  const rawParts = found.length >= 2
    ? found.map((item) => item.text)
    : block
        .split(/,|\band\b|\bthen\b/iu)
        .map((part) => cleanSpokenIngredientPhrase(part))
        .filter(Boolean);

  const ingredients = [];
  const seen = new Set();
  for (const part of rawParts) {
    const key = normalizeComparable(part);
    if (!key || seen.has(key)) continue;
    if (key === "salt" && seen.has("salt and pepper")) continue;
    if (key === "pepper" && seen.has("salt and pepper")) continue;
    if (key === "salt and pepper") {
      seen.delete("salt");
      seen.delete("pepper");
      for (let index = ingredients.length - 1; index >= 0; index -= 1) {
        const existingKey = normalizeComparable(ingredients[index]);
        if (existingKey === "salt" || existingKey === "pepper") ingredients.splice(index, 1);
      }
    }
    seen.add(key);
    ingredients.push(part);
  }
  return ingredients.slice(0, 12);
}

function extractGenericSpokenIngredientsFromTranscript(transcriptSection) {
  const source = lightlyNormalizeSourceText(transcriptSection);
  if (!source) return [];

  const patterns = [
    { label: "арбуз", pattern: /(?:^|[^\p{L}])арбуз\p{L}*/iu },
    { label: "мякоть арбуза", pattern: /(?:^|[^\p{L}])мякот\p{L}*/iu },
    { label: "желатин", pattern: /(?:^|[^\p{L}])желатин\p{L}*/iu },
    { label: "сахар", pattern: /(?:^|[^\p{L}])сахар\p{L}*/iu },
    { label: "вода", pattern: /(?:^|[^\p{L}])вод\p{L}*/iu },
    { label: "ягоды", pattern: /(?:^|[^\p{L}])ягод\p{L}*/iu },
    { label: "фрукты", pattern: /(?:^|[^\p{L}])фрукт\p{L}*/iu },
    { label: "малина", pattern: /(?:^|[^\p{L}])малин\p{L}*/iu },
    { label: "ежевика", pattern: /(?:^|[^\p{L}])[еёя]жевик\p{L}*/iu },
    { label: "голубика", pattern: /(?:^|[^\p{L}])голубик\p{L}*/iu },
    { label: "виноград", pattern: /(?:^|[^\p{L}])виноград\p{L}*/iu },
    { label: "chicken", pattern: /\bchicken\b/iu },
    { label: "beans", pattern: /\bbeans?\b/iu },
    { label: "potatoes", pattern: /\bpotatoes?\b/iu },
    { label: "tomatoes", pattern: /\btomatoes?\b/iu },
    { label: "onion", pattern: /\bonions?\b/iu },
    { label: "garlic", pattern: /\bgarlic\b/iu },
    { label: "rice", pattern: /\brice\b/iu },
  ];

  const found = [];
  for (const item of patterns) {
    const match = source.match(item.pattern);
    if (match && typeof match.index === "number") {
      found.push({ index: match.index, text: item.label });
    }
  }

  const ingredients = [];
  const seen = new Set();
  for (const item of found.sort((left, right) => left.index - right.index)) {
    const key = normalizeComparable(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ingredients.push(item.text);
  }
  return ingredients.slice(0, 12);
}

function recipeActionTextFromTranscript(transcriptSection) {
  const source = String(transcriptSection || "").replace(/\r\n?/g, "\n").trim();
  if (!source) return "";
  const startMatch = source.match(/\b(?:so\s+first\s+of\s+all|first\s+of\s+all|let(?:'|вЂ™)s\s+get\s+started|РЅР°С‡РЅРµРј|РїСЂРёСЃС‚СѓРїРёРј)\b/i);
  const started = startMatch && typeof startMatch.index === "number" ? source.slice(startMatch.index) : source;
  const stopMatch = started.match(/\b(?:did\s+you\s+know|have\s+you\s+checked\s+out|thanks\s+so\s+much\s+for\s+watching|don't\s+forget\s+to\s+follow|subscribe\s+to\s+our)\b/i);
  return stopMatch && typeof stopMatch.index === "number" ? started.slice(0, stopMatch.index) : started;
}

function buildGenericSpokenInstructionsFromTranscript(transcriptSection) {
  const source = recipeActionTextFromTranscript(transcriptSection);
  const actionPattern = /(?:\b(?:add|bake|boil|cook|cover|cut|fry|heat|mix|place|prepare|simmer|stir|transfer|whisk)\b|бер[её]м|вынимаем|съедаем|разводим|соединяем|выкладываем|добав(?:им|ляем|ьте)|заливаем|отправляем|охлаждаем|готово|нарезаем|смешиваем|варим|жарим|тушим|запекаем)/iu;
  const instructions = [];
  const seen = new Set();

  for (const sentence of splitSentences(source)) {
    const cleaned = cleanSpokenInstruction(sentence);
    if (cleaned.length < 18 || cleaned.length > 450) continue;
    if (!actionPattern.test(cleaned) || isServiceOrSeoLine(cleaned)) continue;
    const key = normalizeComparable(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    instructions.push(cleaned);
  }

  return instructions.slice(0, 10);
}

function cleanSpokenInstruction(value) {
  return String(value || "")
    .replace(/\[Music\]/giu, " ")
    .replace(/\s+/g, " ")
    .trim(" .,:;~`'\"");
}

function extractFirstMatchText(source, pattern) {
  const match = source.match(pattern);
  return match ? cleanSpokenInstruction(match[0]) : "";
}

function buildSpokenInstructionsFromTranscript(transcriptSection) {
  const source = cleanSpokenInstruction(
    String(transcriptSection || "")
      .replace(/\bdid you know that we have a free air fryer mini course[\s\S]*?\bwe've\s+beat\b/iu, " ")
      .replace(/\bhave you checked out air fryer easy every day yet[\s\S]*$/iu, " "),
  );
  if (!source) return [];

  const candidates = [
    extractFirstMatchText(source, /\b(?:chicken breast into your tray|instead chicken breast into your tray)[\s\S]{0,220}?(?:adding in the butternut squash|butternut squash)/iu),
    extractFirstMatchText(source, /\bwhat we're going to do now[\s\S]{0,220}?(?:mixed herbs in as well|sprinkling of it)/iu),
    extractFirstMatchText(source, /\bmix up the butternut squash[\s\S]{0,220}?(?:ready to go in the air fryer|get it on)/iu),
    extractFirstMatchText(source, /\b(?:air fryer out|looking for)\s+[\s\S]{0,180}?(?:12 minutes|press Start)/iu),
    extractFirstMatchText(source, /\badd in the green beans[\s\S]{0,220}?(?:herbs that you've already used|chicken)/iu),
    extractFirstMatchText(source, /\badd in a little bit more of the olive oil[\s\S]{0,220}?(?:seasoning|getting the oil on them)/iu),
    extractFirstMatchText(source, /\b(?:back on looking for now|looking for now)\s+[\s\S]{0,160}?(?:8 minutes|press start)/iu),
    extractFirstMatchText(source, /\binternal temperature[\s\S]{0,120}?chicken is fully cooked/iu),
  ].filter(Boolean);

  const instructions = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = normalizeComparable(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    instructions.push(candidate);
  }
  return instructions;
}

function splitLongCookingNarration(text) {
  const source = cleanSpokenInstruction(
    String(text || "")
      .replace(/\[Music\]/giu, " ")
      .replace(/\b(?:please click|click that like button|subscribe|follow us|thanks so much for watching|I will see you next time)[\s\S]*$/iu, " "),
  );
  if (!source || source.length < 500) return [];

  const parts = source
    .split(/\s+(?=(?:pan\s+on|once\s+the\s+oil|at\s+this\s+point|fry\s+on|and\s+then\s+add|then\s+add|then\s+comes|cover\s+on|after\s+\d+\s+minutes?|now\s+if|add\s+about|I\s+also\s+added|now\s+with|now\s+cover|do\s+a\s+taste\s+test|you\s+can\s+serve)\b)/iu)
    .map((part) => cleanSpokenInstruction(part))
    .filter((part) =>
      part.length >= 35 &&
      part.length <= 700 &&
      /(?:add|fry|cook|heat|cover|simmer|mix|mash|serve|season|stir|boil|bake|roast|oil|pan|minutes?|teaspoons?|tablespoons?)/iu.test(part) &&
      !isServiceOrSeoLine(part)
    );

  const instructions = [];
  const seen = new Set();
  for (const part of parts) {
    const key = normalizeComparable(part.slice(0, 160));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    instructions.push(part);
  }
  return instructions.slice(0, 10);
}

function compactTextForLocalModel(text, evidence) {
  const source = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (source.length <= 4200) return source;

  const sentences = splitSentences(source);
  const keep = new Map();
  const mark = (index) => {
    if (index >= 0 && index < sentences.length) keep.set(index, sentences[index]);
  };

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const normalized = normalizeComparable(sentence);
    const hasEvidence =
      /\d/.test(sentence) ||
      (evidence.numeric || []).some((item) => item.text === sentence) ||
      (evidence.ingredients || []).some((item) => item.text === sentence) ||
      /add|boil|cook|fry|bake|mix|stir|РЅР°СЂРµР¶|РІР°СЂ|Р¶Р°СЂ|С‚СѓС€|РґРѕР±Р°РІ|РіРѕС‚РѕРІ|РєРёРїСЏС‚|РѕР±Р¶Р°СЂ|РїРµСЂРµРјРµС€|cocinar|aГ±adir|ajouter|cuire|kochen|braten/i.test(normalized);
    if (hasEvidence) {
      mark(index - 1);
      mark(index);
      mark(index + 1);
    }
  }

  const compact = [...keep.keys()]
    .sort((a, b) => a - b)
    .map((index) => keep.get(index))
    .join("\n");

  return compact.slice(0, 6500) || source.slice(0, 6500);
}

function parseStructuredRecipeDraft(text) {
  const source = String(text || "").trim();
  if (!source) return null;

  const titleSection = extractSection(source, "TITLE");
  const ocrSection = extractSection(source, "VIDEO OCR TEXT");
  const descriptionSection = extractSection(source, "VIDEO DESCRIPTION") || ocrSection || source;
  const transcriptSection = extractSection(source, "VIDEO TRANSCRIPT") || extractSection(source, "SPEECH TRANSCRIPT");
  const hasExplicitIngredientHeading = /(?:^|\n)\s*ingredients(?:\s*:|[^\n]{0,120}(?:-|:))/iu.test(descriptionSection) || /(?:^|\n)\s*ингредиенты\s*:/iu.test(descriptionSection);
  const lines = hasExplicitIngredientHeading
    ? descriptionSection.replace(/\r\n?/g, "\n").split(/\n/).map((line) => line.trim()).filter(Boolean)
    : buildCandidateRecipeLines(descriptionSection);

  const ingredientLinePattern =
    /^(?:[-*вЂўв–Є]\s*)?([\p{L}\d\s"'().,%+-]{2,80})\s*(?:-|вЂ“|вЂ”|:)\s*((?:\d|РїРѕ РІРєСѓСЃСѓ|РїРѕ\s+РІРєСѓСЃСѓ)[\p{L}\d\s.,/%+-]*)$/iu;
  const quantityFirstIngredientPattern =
    /^(?:[-*вЂўв–Є]\s*)?(?:(?:\d+(?:[.,]\d+)?(?:\s*[-вЂ“вЂ”]\s*\d+(?:[.,]\d+)?)?|\d+\s*\/\s*\d+)\s*(?:РєРі|kg|Рі|РіСЂ|g|gram|grams|РјР»|ml|Р»|l|Р»РёС‚СЂ(?:Р°|РѕРІ)?|liter(?:s)?|litre(?:s)?|СЃС‚\.?\s*Р»\.?|tbsp|С‡\.?\s*Р»\.?|tsp|Р·СѓР±С‡РёРє(?:Р°|РѕРІ)?|clove(?:s)?|Р»СѓРє|onion)?\b\s+.+|(?:СЃРѕР»СЊ|salt|С‡РµСЂРЅС‹Р№\s+РјРѕР»РѕС‚С‹Р№\s+РїРµСЂРµС†|black\s+pepper)\b.+)$/iu;
  const productFirstIngredientPattern =
    /^(?:[-*вЂўв–Є]\s*)?[\p{L}\d\s"'().,+-]{2,90}\s+(?:(?:\d+(?:[.,]\d+)?(?:\s*[-вЂ“вЂ”]\s*\d+(?:[.,]\d+)?)?|\d+\s*\/\s*\d+)\s*(?:РєРі|kg|Рі|РіСЂ|РіСЂР°РјРј(?:РѕРІ|Р°)?|g|gram|grams|С€С‚\.?|С€С‚СѓРє(?:Рё)?|РјР»|ml|Р»|l|Р»РёС‚СЂ(?:Р°|РѕРІ)?|liter(?:s)?|litre(?:s)?|СЃС‚\.?\s*Р»\.?|tbsp|С‡\.?\s*Р»\.?|tsp|РІРµС‚Рє(?:Р°|Рё)?|Р·СѓР±С‡РёРє(?:Р°|РѕРІ)?|clove(?:s)?)|РїРѕ\s+РІРєСѓСЃСѓ|to\s+taste|optional)(?:\b|$).*/iu;
  const productBareCountPattern =
    /^(?:[-*вЂўв–Є]\s*)?[\p{L}\d\s"'().,+-]{2,80}\s+\d+(?:[.,]\d+)?$/iu;
  const wordQuantityIngredientPattern =
    /^(?:[-*вЂўв–Є]\s*)?[\p{L}\d\s"'().,+-]{2,90}\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|РїСЏС‚СЊСЃРѕС‚|С‡РµС‚С‹СЂРµСЃС‚Р°|С‚СЂРёСЃС‚Р°|РґРІРµСЃС‚Рё|РґРµСЃСЏС‚СЊ|РґРµРІСЏС‚СЊ|РІРѕСЃРµРјСЊ|СЃРµРјСЊ|С€РµСЃС‚СЊ|РїСЏС‚СЊ|С‡РµС‚С‹СЂРµ|РѕРґРёРЅ|РѕРґРЅР°|РґРІР°|РґРІРµ|С‚СЂРё|СЃС‚Рѕ|РїРѕР»(?:РѕРІРёРЅР°)?|ein|eine|zwei|drei|vier|fuenf|fГјnf|sechs|sieben|acht|neun|zehn|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:РєРі|kg|РіСЂР°РјРј(?:РѕРІ|Р°)?|РіСЂ|Рі|g|gram|grams|gramm|РјР»|ml|РјРёР»Р»РёР»РёС‚СЂ(?:РѕРІ|Р°)?|Р»|l|Р»РёС‚СЂ(?:Р°|РѕРІ)?|liter(?:s)?|litre(?:s)?|С€С‚\.?|С€С‚СѓРє(?:Рё)?|pcs?|eggs?|СЏР№С†(?:Р°|Рѕ)?|eier|huevos|oeufs|clove(?:s)?)\b.*$/iu;
  const inlineWordQuantityIngredientPattern =
    /([\p{L}][\p{L}'-]{1,30}(?:\s+[\p{L}][\p{L}'-]{1,30}){0,2})\s+(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|РїСЏС‚СЊСЃРѕС‚|С‡РµС‚С‹СЂРµСЃС‚Р°|С‚СЂРёСЃС‚Р°|РґРІРµСЃС‚Рё|РґРµСЃСЏС‚СЊ|РґРµРІСЏС‚СЊ|РІРѕСЃРµРјСЊ|СЃРµРјСЊ|С€РµСЃС‚СЊ|РїСЏС‚СЊ|С‡РµС‚С‹СЂРµ|РѕРґРёРЅ|РѕРґРЅР°|РґРІР°|РґРІРµ|С‚СЂРё|СЃС‚Рѕ|ein|eine|zwei|drei|vier|fuenf|fГјnf|sechs|sieben|acht|neun|zehn|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(РєРі|kg|РіСЂР°РјРј(?:РѕРІ|Р°)?|РіСЂ|РјРёР»Р»РёР»РёС‚СЂ(?:РѕРІ|Р°)?|РјР»|Р»РёС‚СЂ(?:Р°|РѕРІ)?|Р»|С€С‚СѓРє(?:Рё)?|С€С‚\.?|СЏР№С†(?:Р°|Рѕ)?|g|gram|grams|gramm|ml|l|liter(?:s)?|litre(?:s)?|pcs?|eggs?|eier|huevos|oeufs|clove(?:s)?)/giu;
  const isIngredientHeading = (line) => {
    const normalized = line.toLowerCase().replace(/:$/, "").trim();
    return normalized === "\u0438\u043d\u0433\u0440\u0435\u0434\u0438\u0435\u043d\u0442\u044b" || normalized === "ingredients" || normalized.startsWith("ingredients ");
  };
  const isIngredientBlockStop = (line) => {
    const normalized = line.toLowerCase().trim();
    return (
      isServiceOrSeoLine(line) ||
      normalized.startsWith("\u043d\u0430 \u043a\u0430\u0441\u0442\u0440\u044e\u043b\u044e") ||
      /^\u043d\u0430\s+\d/i.test(normalized) ||
      normalized.startsWith("\u043a\u0430\u043a ") ||
      normalized.startsWith("\u0441\u043f\u043e\u0441\u043e\u0431 \u043f\u0440\u0438\u0433\u043e\u0442\u043e\u0432") ||
      normalized.startsWith("\u043f\u0440\u0438\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0438\u0435") ||
      normalized.startsWith("\u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043e\u0432\u043a\u0430") ||
      normalized.startsWith("transcript")
      || normalized.startsWith("serve ")
      || normalized.startsWith("keep in touch")
      || normalized.startsWith("related videos")
      || normalized.startsWith("background music")
      || normalized.startsWith("disclaimer")
    );
  };
  const yieldOnlyPattern =
    /^(?:\u043d\u0430\s*(?:\u043a\u0430\u0441\u0442\u0440\u044e\u043b\u044e\s*)?)?\d+(?:[.,]\d+)?(?:\s*[-вЂ“вЂ”]\s*\d+(?:[.,]\d+)?)?\s*(?:Р»|l|Р»РёС‚СЂ(?:Р°|РѕРІ)?|liter(?:s)?|litre(?:s)?)$/iu;
  const ingredientBlockIndexes = new Set();
  const headingIndex = lines.findIndex((line) => isIngredientHeading(line));
  if (headingIndex >= 0) {
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (isIngredientBlockStop(line)) break;
      if (line.length <= 120) ingredientBlockIndexes.add(index);
    }
  }
  const looksLikeIngredientLine = (line, index = -1) =>
    !isServiceOrSeoLine(line) &&
    !isOcrCodeFragment(line) &&
    !yieldOnlyPattern.test(line) &&
    !isIngredientHeading(line) &&
    !isIngredientBlockStop(line) &&
    (
      /(?:\d+(?:[.,]\d+)?\s*(?:gm|oz|lb|lbs)\b)/iu.test(line) ||
      ingredientLinePattern.test(line) ||
      quantityFirstIngredientPattern.test(line) ||
      productFirstIngredientPattern.test(line) ||
      productBareCountPattern.test(line) ||
      wordQuantityIngredientPattern.test(line) ||
      ingredientBlockIndexes.has(index)
    );
  const ingredients = [];
  const seenIngredients = new Set();
  let usedSpokenIngredients = false;

  for (const [index, line] of lines.entries()) {
    const cleaned = line.replace(/\s+/g, " ").trim();
    let inlineIngredientCount = 0;
    const preferWholeIngredientLine = hasExplicitIngredientHeading || ingredientBlockIndexes.has(index);
    if (!preferWholeIngredientLine) {
      for (const inlineMatch of cleaned.matchAll(inlineWordQuantityIngredientPattern)) {
        const ingredient = trimIngredientPhrase(`${inlineMatch[1].trim()} ${inlineMatch[2].trim()} ${inlineMatch[3].trim()}`);
        const key = normalizeComparable(ingredient);
        if (!seenIngredients.has(key)) {
          seenIngredients.add(key);
          ingredients.push(ingredient);
          inlineIngredientCount += 1;
        }
      }
    }
    inlineWordQuantityIngredientPattern.lastIndex = 0;
    if (inlineIngredientCount >= 2) continue;
    if (!looksLikeIngredientLine(cleaned, index)) continue;
    const match = cleaned.match(ingredientLinePattern);
    const ingredient = trimIngredientPhrase(match ? `${match[1].trim()} - ${match[2].trim()}` : cleaned);
    if (!ingredient) continue;
    const key = normalizeComparable(ingredient);
    if (!seenIngredients.has(key)) {
      seenIngredients.add(key);
      ingredients.push(ingredient);
    }
  }

  const hasCookingAction = /add|boil|cook|fry|bake|mix|stir|knead|simmer|roast|бер[её]м|вынимаем|разводим|соединяем|выкладываем|добав|заливаем|отправляем|охлаждаем|готов|нарез|смеш|вар|жар|туш|запек|РЅР°СЂРµР¶|РІР°СЂ|Р¶Р°СЂ|С‚СѓС€|РґРѕР±Р°РІ|РіРѕС‚РѕРІ|РєРёРїСЏС‚|РѕР±Р¶Р°СЂ|РїРµСЂРµРјРµС€|СЃРјРµС€|РІС‹РїРµРє|cocinar|aГ±adir|mezclar|hornear|ajouter|cuire|mГ©langer|melanger|kochen|braten|mischen|backen/i.test(source);
  if (ocrSection) {
    const sparseFoodIngredients = collectSparseFoodIngredients(lines);
    if (sparseFoodIngredients.length >= 2) {
      ingredients.length = 0;
      seenIngredients.clear();
    }
    for (const ingredient of sparseFoodIngredients) {
      const key = normalizeComparable(ingredient);
      if (!seenIngredients.has(key)) {
        seenIngredients.add(key);
        ingredients.push(ingredient);
      }
    }
  }
  if (ingredients.length < 2 && transcriptSection) {
    const spokenIngredients = extractSpokenIngredientsFromTranscript(transcriptSection);
    for (const ingredient of spokenIngredients) {
      const key = normalizeComparable(ingredient);
      if (!seenIngredients.has(key)) {
        seenIngredients.add(key);
        ingredients.push(ingredient);
      }
    }
    usedSpokenIngredients = spokenIngredients.length >= 2;
  }
  if (ingredients.length < 2 && transcriptSection) {
    const genericSpokenIngredients = extractGenericSpokenIngredientsFromTranscript(transcriptSection);
    for (const ingredient of genericSpokenIngredients) {
      const key = normalizeComparable(ingredient);
      if (!seenIngredients.has(key)) {
        seenIngredients.add(key);
        ingredients.push(ingredient);
      }
    }
    usedSpokenIngredients = genericSpokenIngredients.length >= 2;
  }

  const hasSparseOcrRecipe =
    Boolean(ocrSection) &&
    ingredients.length >= 2 &&
    /(?:РёРЅРіСЂРµРґРёРµРЅС‚|ingredient|СЂРµС†РµРїС‚|recipe|РјРѕСЂРѕР¶РµРЅ|СЃСѓРї|Р±РѕСЂС‰|СЃР°Р»Р°С‚|РїРёСЂРѕРі|С‚РѕСЂС‚|Р±Р»СЋРґРѕ|dish)/iu.test(source);
  if (ingredients.length < 2 || (ingredients.length < 4 && !hasCookingAction && !hasSparseOcrRecipe)) return null;

  const title =
    titleSection.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ||
    lines.find((line) => /(?:СЂРµС†РµРїС‚|Р±РѕСЂС‰|СЃСѓРї|РїРёСЂРѕРі|СЃР°Р»Р°С‚|С‚РѕСЂС‚|Р±Р»СЋРґРѕ)/iu.test(line)) ||
    "Р РµС†РµРїС‚ РёР· РІРёРґРµРѕ";
  const finalIngredients = ingredients.filter((ingredient) => normalizeComparable(ingredient) !== normalizeComparable(title));
  const recipeIngredients = finalIngredients.length >= 2 ? finalIngredients : ingredients;

  const nonIngredientLines = lines.filter(
    (line, index) => !looksLikeIngredientLine(line, index) && !isIngredientHeading(line) && !isIngredientBlockStop(line) && !isServiceOrSeoLine(line)
  );
  const combinedInstructionsText = usedSpokenIngredients
    ? recipeActionTextFromTranscript(transcriptSection)
    : `${nonIngredientLines.join("\n")}\n${transcriptSection}`;
  const spokenInstructions = usedSpokenIngredients ? buildSpokenInstructionsFromTranscript(transcriptSection) : [];
  const instructions = splitSentences(combinedInstructionsText)
    .filter((sentence) =>
      /(?:add|allow|bake|beat|boil|chill|combine|cook|cover|cut|deep\s*fry|fill|fold|fry|heat|knead|mix|place|prepare|remove|rise|roll|roast|simmer|stir|transfer|whisk|РЅР°СЂРµР¶|РІР°СЂ|Р¶Р°СЂ|С‚СѓС€|Р·Р°РїРµРє|СЃРјРµС€|РґРѕР±Р°РІ|РїРѕСЃРѕР»|РїРѕРїРµСЂС‡|РіРѕС‚РѕРІ|РєРёРїСЏС‚|РїРѕРґР°|РёР·РјРµР»СЊС‡|РѕР±Р¶Р°СЂ|РїРµСЂРµРјРµС€)/iu.test(sentence)
    )
    .filter((sentence) => !isServiceOrSeoLine(sentence))
    .filter((sentence) => !ingredients.some((ingredient) => normalizeComparable(sentence) === normalizeComparable(ingredient)))
    .slice(0, 8);

  if (spokenInstructions.length >= 3) {
    instructions.length = 0;
    instructions.push(...spokenInstructions);
  }
  const genericSpokenInstructions = transcriptSection ? buildGenericSpokenInstructionsFromTranscript(transcriptSection) : [];
  if (genericSpokenInstructions.length >= 2 && instructions.length < 2) {
    instructions.length = 0;
    instructions.push(...genericSpokenInstructions);
  }
  if (instructions.length === 1 && instructions[0].length > 700) {
    const splitInstructions = splitLongCookingNarration(instructions[0]);
    if (splitInstructions.length >= 3) {
      instructions.length = 0;
      instructions.push(...splitInstructions);
    }
  }
  if (!instructions.length && transcriptSection) {
    const splitInstructions = splitLongCookingNarration(transcriptSection);
    if (splitInstructions.length >= 3) {
      instructions.push(...splitInstructions);
    }
  }

  if (!instructions.length) {
    const sourceLooksRussian = /[\u0400-\u04FF]/u.test(source);
    instructions.push(
      sourceLooksRussian
        ? "РџРѕРґРіРѕС‚РѕРІСЊС‚Рµ РёРЅРіСЂРµРґРёРµРЅС‚С‹ РёР· СЃРїРёСЃРєР° Рё РїСЂРёРіРѕС‚РѕРІСЊС‚Рµ Р±Р»СЋРґРѕ РїРѕ РѕРїРёСЃР°РЅРёСЋ РёСЃС‚РѕС‡РЅРёРєР°."
        : "Prepare the ingredients from the list and cook the dish following the source description.",
    );
  }

  const description =
    lines.find((line, index) => line.length > 40 && !looksLikeIngredientLine(line, index)) ||
    (ocrSection ? "Р§РµСЂРЅРѕРІРёРє СЂРµС†РµРїС‚Р° СЃРѕР±СЂР°РЅ РёР· С‚РµРєСЃС‚Р°, СЂР°СЃРїРѕР·РЅР°РЅРЅРѕРіРѕ РІ РєР°РґСЂР°С… РІРёРґРµРѕ." : "Р§РµСЂРЅРѕРІРёРє СЂРµС†РµРїС‚Р° СЃРѕР±СЂР°РЅ РёР· СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅРѕРіРѕ РѕРїРёСЃР°РЅРёСЏ РІРёРґРµРѕ.");

  return {
    title,
    description,
    ingredients: recipeIngredients,
    instructions,
    cooking_time: "",
    servings: null,
    difficulty: "medium",
    tags: ["video", "draft"],
    notes: ocrSection
      ? "Р§РµСЂРЅРѕРІРёРє СЃРѕР±СЂР°РЅ Р±РµР· LLM РёР· OCR-С‚РµРєСЃС‚Р° РїРѕРІРµСЂС… РІРёРґРµРѕ. РџСЂРѕРІРµСЂСЊС‚Рµ РёРЅРіСЂРµРґРёРµРЅС‚С‹ Рё С€Р°РіРё РїСЂРёРіРѕС‚РѕРІР»РµРЅРёСЏ."
      : "Р§РµСЂРЅРѕРІРёРє СЃРѕР±СЂР°РЅ Р±РµР· LLM РёР· СЏРІРЅРѕРіРѕ СЃРїРёСЃРєР° РёРЅРіСЂРµРґРёРµРЅС‚РѕРІ РІ РѕРїРёСЃР°РЅРёРё РІРёРґРµРѕ. РџСЂРѕРІРµСЂСЊС‚Рµ С€Р°РіРё РїСЂРёРіРѕС‚РѕРІР»РµРЅРёСЏ.",
    category_hint: "",
  };
}

function normalizeRecipeOutput(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LocalRecipeParserError("RECIPE_JSON_INVALID", "Local model returned invalid JSON.");
  }

  const status = typeof parsed.status === "string" ? parsed.status : "insufficient_data";
  if (status === "not_a_recipe") {
    throw new LocalRecipeParserError("NOT_A_RECIPE", "The provided text is not a recipe.");
  }
  if (status !== "ok") {
    throw new LocalRecipeParserError("RECIPE_TEXT_INSUFFICIENT", "Not enough recipe data was found in the text.");
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const ingredients = normalizeStringArray(parsed.ingredients);
  const instructions = normalizeStringArray(parsed.instructions);

  if (!title || ingredients.length === 0 || instructions.length === 0) {
    throw new LocalRecipeParserError("RECIPE_TEXT_INSUFFICIENT", "Not enough recipe data was found in the text.");
  }

  const servings =
    typeof parsed.servings === "number" && Number.isInteger(parsed.servings) && parsed.servings > 0
      ? parsed.servings
      : null;

  return {
    title,
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    ingredients,
    instructions,
    cooking_time: typeof parsed.cooking_time === "string" ? parsed.cooking_time.trim() : "",
    servings,
    difficulty: normalizeDifficulty(parsed.difficulty),
    tags: normalizeStringArray(parsed.tags),
    notes: typeof parsed.notes === "string" ? parsed.notes.trim() : "",
    category_hint: typeof parsed.category_hint === "string" ? parsed.category_hint.trim() : "",
  };
}

function extractTemperatureMentions(text) {
  const patterns = [
    /\b\d{2,3}\s*В°\s*[CFРЎ]?\b/giu,
    /(?:^|[^\p{L}\p{N}])(\d{2,3}\s*(?:РіСЂР°РґСѓСЃ(?:РѕРІ|Р°)?|grad|gradus|degrees?))(?![\p{L}\p{N}])/giu,
  ];
  const mentions = [];
  const seen = new Set();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] || match[0]).trim();
      const key = value.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        mentions.push(value);
      }
    }
  }

  return mentions;
}

function preserveNumericFacts(recipe, sourceText) {
  const flattened = [
    recipe.title,
    recipe.description,
    ...recipe.ingredients,
    ...recipe.instructions,
    recipe.cooking_time,
    recipe.notes,
  ]
    .join("\n")
    .toLowerCase();

  const missingTemperatures = extractTemperatureMentions(sourceText).filter(
    (value) => !flattened.includes(value.toLowerCase()),
  );

  if (missingTemperatures.length > 0) {
    const note = missingTemperatures.join(", ");
    recipe.notes = recipe.notes ? `${recipe.notes}\n${note}` : note;
  }

  return recipe;
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new LocalRecipeParserError("RECIPE_JSON_NOT_FOUND", "Local model returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      throw new LocalRecipeParserError("RECIPE_JSON_NOT_FOUND", "Local model did not return JSON.");
    }
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch (error) {
      throw new LocalRecipeParserError("RECIPE_JSON_INVALID", "Local model returned malformed JSON.", {
        parseError: error.message,
      });
    }
  }
}

function buildRecipeParserPrompt(text, options = {}) {
  const sourceLanguage = options.sourceLanguage ? `\nDetected transcript language hint: ${options.sourceLanguage}` : "";
  const evidenceBlock = options.evidence ? `\n\n${formatEvidenceForPrompt(options.evidence)}` : "";
  const normalizedText = options.normalizedText && options.normalizedText !== text
    ? `\n\nLIGHTLY NORMALIZED COPY (spacing only, original text above is authoritative):\n${options.normalizedText}`
    : "";

  return {
    system: `You are a multilingual recipe structure extractor. Return exactly one JSON object.

Formatting is unreliable. Infer recipe structure semantically. Colons, dashes, bullets, punctuation and line breaks are optional and must not be required.

Use only supplied text. Do not invent facts. Preserve source language and exact quantities/units when present. Ingredients may be written before or after quantities, joined together, or mixed with transcript text. Description and transcript may complement each other.

If this is clearly not cooking content, status="not_a_recipe". If it is food-related but lacks enough concrete recipe data, status="insufficient_data". Otherwise status="ok".

Keep output short. Empty optional fields are allowed. Use servings=null when not stated. Difficulty must be "easy", "medium", or "hard".`,
    user: `Extract the recipe from this transcript/text.${sourceLanguage}

ORIGINAL TEXT:
${text}${normalizedText}${evidenceBlock}`,
  };

  return {
    system: `You are a strict multilingual recipe extraction engine.
Return exactly one JSON object that matches the provided schema.

Rules:
- Extract a recipe only from the supplied transcript/text.
- If the text names a dish or food AND contains ingredients AND cooking actions, status MUST be "ok".
- A recipe can be valid even when ingredient quantities are missing.
- Do not invent ingredients, quantities, temperatures, times, servings, tools, or steps.
- In ingredients, preserve the full ingredient phrase with quantity and unit when present, for example "300 g flour", not just "flour".
- Preserve numbers, units, temperatures, and times exactly as they appear when possible.
- Do not normalize or abbreviate units: keep "300 Gramm" as "300 Gramm", not "300 g"; keep "250 Milliliter", not "250 ml".
- Quantities, temperatures, cooking times, and servings may only be used if supported by the transcript or numeric evidence.
- If the text names a dish, food, or main cooked item, title must contain that name.
- If cooking time or oven temperature is stated, include it in cooking_time and/or instructions exactly as written.
- Every mentioned temperature must appear in the output instructions or cooking_time exactly as written, even if it is optional advice.
- If an ingredient is mentioned without a quantity, keep it without inventing a quantity.
- If servings are not stated, set servings to null.
- If cooking time, notes, category hint, or description are not stated or cannot be inferred directly from the text, use an empty string.
- Missing optional fields such as cooking time, servings, description, notes, or category hint do not make a recipe insufficient.
- Never write placeholders like "unknown", "unspecified", "not specified", "РЅРµСЃpecific", "РЅРµ СѓРєР°Р·Р°РЅРѕ", or "N/A".
- Keep the recipe in the original source language. Do not translate.
- Mixed-language food names or ingredients must stay as spoken/written.
- Remove ads, greetings, personal stories, and unrelated talk.
- A negative instruction must never be converted into a positive instruction.
- Commentary, quality explanations, optional examples, or serving suggestions must not become ingredients unless clearly used in the recipe.
- Use "not_a_recipe" only for ordinary conversation or non-cooking content.
- Use "insufficient_data" only when the text is food-related but lacks concrete ingredients or cooking steps.
- Use difficulty only as "easy", "medium", or "hard"; choose "medium" if the text does not say.`,

    user: `Extract the recipe from this transcript/text.${sourceLanguage}

TEXT:
${text}${evidenceBlock}`,
  };
}

function buildRecipeJsonGrammar() {
  return String.raw`
root ::= assistant-prefix? object assistant-suffix? space
assistant-prefix ::= "<|im_start|>assistant" "\n"?
assistant-suffix ::= "<|im_end|>"
object ::= "{" space status-kv "," space title-kv "," space description-kv "," space ingredients-kv "," space instructions-kv "," space cooking-time-kv "," space servings-kv "," space difficulty-kv "," space tags-kv "," space notes-kv "," space category-hint-kv space "}"
status-kv ::= "\"status\"" space ":" space status
status ::= "\"ok\"" | "\"not_a_recipe\"" | "\"insufficient_data\""
title-kv ::= "\"title\"" space ":" space string
description-kv ::= "\"description\"" space ":" space string
ingredients-kv ::= "\"ingredients\"" space ":" space string-array
instructions-kv ::= "\"instructions\"" space ":" space string-array
cooking-time-kv ::= "\"cooking_time\"" space ":" space string
servings-kv ::= "\"servings\"" space ":" space (integer | "null")
difficulty-kv ::= "\"difficulty\"" space ":" space ("\"easy\"" | "\"medium\"" | "\"hard\"")
tags-kv ::= "\"tags\"" space ":" space string-array
notes-kv ::= "\"notes\"" space ":" space string
category-hint-kv ::= "\"category_hint\"" space ":" space string
string-array ::= "[" space (string ("," space string)*)? space "]"
integer ::= "-"? ([0] | [1-9] [0-9]{0,15})
string ::= "\"" char* "\""
char ::= [^"\\\x7F\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4})
space ::= [ \t\n\r]*
`.trim();
}

function buildTranslationJsonGrammar() {
  return String.raw`
root ::= assistant-prefix? object assistant-suffix? space
assistant-prefix ::= "<|im_start|>assistant" "\n"?
assistant-suffix ::= "<|im_end|>"
object ::= "{" space title-kv "," space description-kv "," space ingredients-kv "," space instructions-kv "," space cooking-time-kv "," space servings-kv "," space difficulty-kv "," space tags-kv "," space notes-kv "," space category-hint-kv space "}"
title-kv ::= "\"title\"" space ":" space string
description-kv ::= "\"description\"" space ":" space string
ingredients-kv ::= "\"ingredients\"" space ":" space string-array
instructions-kv ::= "\"instructions\"" space ":" space string-array
cooking-time-kv ::= "\"cooking_time\"" space ":" space string
servings-kv ::= "\"servings\"" space ":" space (integer | "null")
difficulty-kv ::= "\"difficulty\"" space ":" space ("\"easy\"" | "\"medium\"" | "\"hard\"")
tags-kv ::= "\"tags\"" space ":" space string-array
notes-kv ::= "\"notes\"" space ":" space string
category-hint-kv ::= "\"category_hint\"" space ":" space string
string-array ::= "[" space (string ("," space string)*)? space "]"
integer ::= "-"? ([0] | [1-9] [0-9]{0,15})
string ::= "\"" char* "\""
char ::= [^"\\\x7F\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4})
space ::= [ \t\n\r]*
`.trim();
}

const LANGUAGE_NAMES = {
  en: "English",
  de: "German",
  ru: "Russian",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  pl: "Polish",
  tr: "Turkish",
  uk: "Ukrainian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
};

function normalizeLanguageCode(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  if (!/^[a-z]{2,3}$/.test(normalized)) return null;
  return normalized;
}

function buildRecipeTranslationPrompt(recipe, targetLanguage) {
  const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  const payload = {
    title: recipe.title || "",
    description: recipe.description || "",
    ingredients: normalizeStringArray(recipe.ingredients),
    instructions: normalizeStringArray(recipe.instructions),
    cooking_time: recipe.cooking_time || "",
    servings: Number.isFinite(Number(recipe.servings)) ? Number(recipe.servings) : null,
    difficulty: normalizeDifficulty(recipe.difficulty),
    tags: normalizeStringArray(recipe.tags),
    notes: recipe.notes || "",
    category_hint: recipe.category_hint || "",
  };

  return {
    system: `You are a precise culinary translator.
Return exactly one JSON object.

Translate only the human-readable textual content of the recipe into ${languageName}.
Preserve all quantities, units, temperatures, timings, ordering and factual meaning exactly.
Do not add, remove, merge, split, or rewrite recipe facts.
Keep the same number of ingredients and instructions unless the input array is empty.
Do not translate ids, URLs, image paths, source metadata, or technical metadata.
The difficulty field must stay one of exactly "easy", "medium", or "hard".`,
    user: `Translate this recipe object into ${languageName}.
Return the translated recipe JSON with the same schema and no markdown.

RECIPE JSON:
${JSON.stringify(payload, null, 2)}`,
  };
}

function extractNumericFacts(value) {
  const text = Array.isArray(value) ? value.join("\n") : String(value || "");
  const matches = [];
  const patterns = [
    /\d+\s*\/\s*\d+/g,
    /\d+(?:[.,]\d+)?/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      uniquePush(matches, match[0].replace(/\s+/g, ""), (item) => item.replace(",", "."));
    }
  }
  return matches;
}

function validateTranslatedRecipe(sourceRecipe, translatedRecipe) {
  const warnings = [];
  const sourceIngredients = normalizeStringArray(sourceRecipe.ingredients);
  const sourceInstructions = normalizeStringArray(sourceRecipe.instructions);

  if (sourceIngredients.length > 0 && translatedRecipe.ingredients.length !== sourceIngredients.length) {
    warnings.push(warning("TRANSLATION_INGREDIENT_COUNT_CHANGED", "Translation changed the number of ingredients.", {
      sourceCount: sourceIngredients.length,
      translatedCount: translatedRecipe.ingredients.length,
    }));
  }

  if (sourceInstructions.length > 0 && translatedRecipe.instructions.length !== sourceInstructions.length) {
    warnings.push(warning("TRANSLATION_STEP_COUNT_CHANGED", "Translation changed the number of instructions.", {
      sourceCount: sourceInstructions.length,
      translatedCount: translatedRecipe.instructions.length,
    }));
  }

  const sourceNumbers = extractNumericFacts([
    sourceRecipe.title,
    sourceRecipe.description,
    sourceRecipe.ingredients,
    sourceRecipe.instructions,
    sourceRecipe.cooking_time,
    sourceRecipe.notes,
  ]);
  const translatedNumbersText = [
    translatedRecipe.title,
    translatedRecipe.description,
    translatedRecipe.ingredients.join("\n"),
    translatedRecipe.instructions.join("\n"),
    translatedRecipe.cooking_time,
    translatedRecipe.notes,
  ].join("\n");
  const normalizedTranslatedNumbers = extractNumericFacts(translatedNumbersText).map((item) => item.replace(",", "."));
  for (const sourceNumber of sourceNumbers) {
    if (!normalizedTranslatedNumbers.includes(sourceNumber.replace(",", "."))) {
      warnings.push(warning("TRANSLATION_NUMERIC_FACT_MISSING", "Translation may have lost a numeric fact.", { value: sourceNumber }));
    }
  }

  return warnings;
}

function safeParseTimeout() {
  const parsed = Number.parseInt(process.env.RECIPE_PARSER_TIMEOUT_MS || "", 10);
  if (Number.isFinite(parsed) && parsed >= 10000) return parsed;
  return DEFAULT_TIMEOUT_MS;
}

function parseTimings(output) {
  const combined = output || "";
  const timing = {};
  const patterns = {
    load_ms: /load time\s*=\s*([0-9.]+)\s*ms/i,
    prompt_ms: /prompt eval time\s*=\s*([0-9.]+)\s*ms/i,
    generation_ms: /eval time\s*=\s*([0-9.]+)\s*ms/i,
    total_ms: /total time\s*=\s*([0-9.]+)\s*ms/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = combined.match(pattern);
    if (match) timing[key] = Number(match[1]);
  }

  const evalCount = combined.match(/eval time\s*=.*?\/\s*([0-9]+)\s*tokens/i);
  if (evalCount) timing.output_tokens = Number(evalCount[1]);
  const promptCount = combined.match(/prompt eval time\s*=.*?\/\s*([0-9]+)\s*tokens/i);
  if (promptCount) timing.input_tokens = Number(promptCount[1]);

  return timing;
}

function getProcessPeakWorkingSet(pid) {
  if (process.platform !== "win32" || !pid) return Promise.resolve(null);

  return new Promise((resolve) => {
    const command = `try { (Get-Process -Id ${Number(pid)}).PeakWorkingSet64 } catch { "" }`;
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.on("close", () => {
      const value = Number.parseInt(stdout.trim(), 10);
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    });
    child.on("error", () => resolve(null));
  });
}

async function parseRecipeTextLocal(app, request) {
  const text = typeof request === "string" ? request : request?.text;
  const sourceLanguage = typeof request?.sourceLanguage === "string" ? request.sourceLanguage : undefined;

  if (typeof text !== "string" || !text.trim()) {
    return errorResult("INVALID_TEXT", "text must be a non-empty string.");
  }
  if (text.length > MAX_INPUT_CHARS) {
    return errorResult("TEXT_TOO_LONG", `text is too long. Maximum length is ${MAX_INPUT_CHARS} characters.`);
  }

  const evidence = extractTranscriptEvidence(text.trim());
  const structuredDraft = parseStructuredRecipeDraft(text.trim());
  if (structuredDraft) {
    const quality = buildQualityReport(structuredDraft, text.trim(), evidence);
    return okResult(structuredDraft, {
      quality: {
        ...quality,
        score: "medium",
        needs_review: true,
        warnings: [
          ...(quality.warnings || []),
          { code: "STRUCTURED_DRAFT", message: "Recipe was drafted from explicit ingredient lines without LLM." },
        ],
      },
      evidence,
      status: "structured_draft",
      timings: {
        wall_seconds: 0,
        timeout_ms: safeParseTimeout(),
        input_chars: text.trim().length,
        peak_working_set_bytes: null,
      },
      runtime: {
        engine: "structured-text",
        version: "local",
      },
      model: {
        repo: "none",
        file: "none",
        size: 0,
      },
    });
  }

  const runtime = await ensureLlamaRuntime(app);
  if (!runtime.ok) {
    return errorResult("LLM_RUNTIME_NOT_FOUND", runtime.message, runtime);
  }

  const model = resolveRecipeModel(app);
  if (!model.ok) {
    return errorResult("RECIPE_MODEL_NOT_FOUND", model.message, model);
  }

  const timeoutMs = safeParseTimeout();
  const normalizedText = lightlyNormalizeSourceText(text.trim());
  const modelText = compactTextForLocalModel(text.trim(), evidence);
  const normalizedModelText = lightlyNormalizeSourceText(modelText);
  const prompt = buildRecipeParserPrompt(modelText, { sourceLanguage, evidence, normalizedText: normalizedModelText || normalizedText });
  const grammar = buildRecipeJsonGrammar();
  const started = process.hrtime.bigint();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let peakWorkingSetBytes = null;

    const args = [
      "-m",
      model.modelPath,
      "-cnv",
      "--single-turn",
      "--skip-chat-parsing",
      "-sys",
      prompt.system,
      "-n",
      "550",
      "-c",
      "4096",
      "--temp",
      "0",
      "--top-p",
      "0.8",
      "--repeat-penalty",
      "1.05",
      "--perf",
      "--simple-io",
      "--no-display-prompt",
      "--grammar",
      grammar,
      "-p",
      prompt.user,
    ];

    const child = spawn(runtime.executablePath, [...(runtime.launcherArgs || []), ...args], {
      cwd: runtime.runtimeDir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearInterval(memoryTimer);
      clearTimeout(timeout);
      resolve(payload);
    };

    const memoryTimer = setInterval(() => {
      getProcessPeakWorkingSet(child.pid).then((value) => {
        if (value && value > (peakWorkingSetBytes || 0)) peakWorkingSetBytes = value;
      });
    }, 1000);

    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(errorResult("RECIPE_PARSE_TIMEOUT", "Local recipe parser timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        finish(errorResult("RECIPE_PARSE_FAILED", "Local recipe parser output was too large."));
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr, "utf8") > MAX_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_STDERR_BYTES);
      }
    });

    child.on("error", (error) => {
      finish(errorResult("LLM_RUNTIME_START_FAILED", "Could not start local llama.cpp runtime.", { message: error.message }));
    });

    child.on("close", (code) => {
      if (settled) return;
      const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      const stderrLower = stderr.toLowerCase();
      if (code !== 0 && (stderrLower.includes("failed to load model") || stderrLower.includes("error loading model"))) {
        finish(errorResult("RECIPE_MODEL_LOAD_FAILED", "Local recipe parser model failed to load.", { code, stderr }));
        return;
      }
      if (code !== 0) {
        finish(errorResult("RECIPE_PARSE_FAILED", "Local recipe parser failed.", { code, stdout: stdout.slice(0, 1000), stderr }));
        return;
      }

      try {
        const parsed = extractJsonObject(stdout);
        const recipe = preserveNumericFacts(normalizeRecipeOutput(parsed), text);
        const quality = buildQualityReport(recipe, text, evidence);
        finish(
          okResult(recipe, {
            quality,
            evidence,
            status: parsed.status,
            timings: {
              wall_seconds: Number(wallSeconds.toFixed(2)),
              timeout_ms: timeoutMs,
              input_chars: text.trim().length,
              peak_working_set_bytes: peakWorkingSetBytes,
              ...parseTimings(stderr + "\n" + stdout),
            },
            runtime: {
              engine: "llama.cpp",
              version: LLAMA_CPP_VERSION,
              executable: runtime.executablePath,
            },
            model: {
              repo: path.resolve(model.modelPath) === path.resolve(getDefaultModelPath(app)) ? MODEL_REPO : "custom/local",
              file: path.basename(model.modelPath),
              quantization: path.basename(model.modelPath).toLowerCase().includes("q4_k_m") ? "Q4_K_M" : "unknown",
              path: model.modelPath,
              size_bytes: model.size,
            },
          }),
        );
      } catch (error) {
        if (error instanceof LocalRecipeParserError) {
          finish(
            errorResult(error.code, error.message, {
              ...error.details,
              stdout_head: stdout.slice(0, 1000),
              stdout_tail: stdout.slice(-2000),
              stderr,
            }),
          );
          return;
        }
        finish(errorResult("RECIPE_PARSE_FAILED", "Local recipe parser failed.", { message: error.message, stderr }));
      }
    });
  });
}

async function translateRecipeLocal(app, request) {
  const recipe = request?.recipe;
  const targetLanguage = normalizeLanguageCode(request?.targetLanguage);

  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    return errorResult("INVALID_RECIPE", "recipe must be an object.");
  }
  if (!targetLanguage) {
    return errorResult("INVALID_LANGUAGE", "targetLanguage must be a supported language code.");
  }

  const runtime = await ensureLlamaRuntime(app);
  if (!runtime.ok) {
    return errorResult("LLM_RUNTIME_NOT_FOUND", runtime.message, runtime);
  }

  const model = resolveRecipeModel(app);
  if (!model.ok) {
    return errorResult("RECIPE_MODEL_NOT_FOUND", model.message, model);
  }

  const timeoutMs = safeParseTimeout();
  const prompt = buildRecipeTranslationPrompt(recipe, targetLanguage);
  const grammar = buildTranslationJsonGrammar();
  const started = process.hrtime.bigint();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let peakWorkingSetBytes = null;

    const args = [
      "-m",
      model.modelPath,
      "-cnv",
      "--single-turn",
      "--skip-chat-parsing",
      "-sys",
      prompt.system,
      "-n",
      "900",
      "-c",
      "4096",
      "--temp",
      "0",
      "--top-p",
      "0.8",
      "--repeat-penalty",
      "1.03",
      "--perf",
      "--simple-io",
      "--no-display-prompt",
      "--grammar",
      grammar,
      "-p",
      prompt.user,
    ];

    const child = spawn(runtime.executablePath, [...(runtime.launcherArgs || []), ...args], {
      cwd: runtime.runtimeDir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearInterval(memoryTimer);
      clearTimeout(timeout);
      resolve(payload);
    };

    const memoryTimer = setInterval(() => {
      getProcessPeakWorkingSet(child.pid).then((value) => {
        if (value && value > (peakWorkingSetBytes || 0)) peakWorkingSetBytes = value;
      });
    }, 1000);

    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(errorResult("RECIPE_TRANSLATION_TIMEOUT", "Local recipe translation timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        finish(errorResult("RECIPE_TRANSLATION_FAILED", "Local recipe translation output was too large."));
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr, "utf8") > MAX_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_STDERR_BYTES);
      }
    });

    child.on("error", (error) => {
      finish(errorResult("LLM_RUNTIME_START_FAILED", "Could not start local llama.cpp runtime.", { message: error.message }));
    });

    child.on("close", (code) => {
      if (settled) return;
      const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      const stderrLower = stderr.toLowerCase();
      if (code !== 0 && (stderrLower.includes("failed to load model") || stderrLower.includes("error loading model"))) {
        finish(errorResult("RECIPE_MODEL_LOAD_FAILED", "Local recipe parser model failed to load.", { code, stderr }));
        return;
      }
      if (code !== 0) {
        finish(errorResult("RECIPE_TRANSLATION_FAILED", "Local recipe translation failed.", { code, stdout: stdout.slice(0, 1000), stderr }));
        return;
      }

      try {
        const parsed = extractJsonObject(stdout);
        const translatedRecipe = normalizeRecipeOutput({ ...parsed, status: "ok" });
        const warnings = validateTranslatedRecipe(recipe, translatedRecipe);
        finish(
          okResult(translatedRecipe, {
            targetLanguage,
            quality: {
              score: warnings.length ? "medium" : "high",
              needs_review: warnings.length > 0,
              warnings,
            },
            timings: {
              wall_seconds: Number(wallSeconds.toFixed(2)),
              timeout_ms: timeoutMs,
              input_chars: JSON.stringify(recipe).length,
              peak_working_set_bytes: peakWorkingSetBytes,
              ...parseTimings(stderr + "\n" + stdout),
            },
            runtime: {
              engine: "llama.cpp",
              version: LLAMA_CPP_VERSION,
              executable: runtime.executablePath,
            },
            model: {
              repo: path.resolve(model.modelPath) === path.resolve(getDefaultModelPath(app)) ? MODEL_REPO : "custom/local",
              file: path.basename(model.modelPath),
              quantization: path.basename(model.modelPath).toLowerCase().includes("q4_k_m") ? "Q4_K_M" : "unknown",
              path: model.modelPath,
              size_bytes: model.size,
            },
          }),
        );
      } catch (error) {
        if (error instanceof LocalRecipeParserError) {
          finish(
            errorResult(error.code, error.message, {
              ...error.details,
              stdout_head: stdout.slice(0, 1000),
              stdout_tail: stdout.slice(-2000),
              stderr,
            }),
          );
          return;
        }
        finish(errorResult("RECIPE_TRANSLATION_FAILED", "Local recipe translation failed.", { message: error.message, stderr }));
      }
    });
  });
}

function downloadFile(url, destinationPath, options = {}) {
  const minBytes = options.minBytes || 1;
  const expectedSha256 = options.sha256 || "";
  const tempPath = `${destinationPath}.tmp`;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "TasteAndTraceLocalRecipeParser/1.0" } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), destinationPath, options).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new LocalRecipeParserError("RECIPE_MODEL_DOWNLOAD_FAILED", `Download failed with HTTP ${response.statusCode}.`));
        return;
      }

      const hash = crypto.createHash("sha256");
      const output = fs.createWriteStream(tempPath);
      let bytes = 0;

      response.on("data", (chunk) => {
        bytes += chunk.length;
        hash.update(chunk);
      });
      response.pipe(output);

      output.on("finish", () => {
        output.close(() => {
          if (bytes < minBytes) {
            fs.rmSync(tempPath, { force: true });
            reject(new LocalRecipeParserError("RECIPE_MODEL_DOWNLOAD_FAILED", "Downloaded file is smaller than expected."));
            return;
          }

          const sha256 = hash.digest("hex");
          if (expectedSha256 && sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
            fs.rmSync(tempPath, { force: true });
            reject(new LocalRecipeParserError("RECIPE_MODEL_DOWNLOAD_FAILED", "Downloaded file checksum does not match."));
            return;
          }

          fs.renameSync(tempPath, destinationPath);
          resolve({ path: destinationPath, bytes, sha256 });
        });
      });

      output.on("error", (error) => {
        fs.rmSync(tempPath, { force: true });
        reject(error);
      });
    });

    request.on("error", (error) => {
      fs.rmSync(tempPath, { force: true });
      reject(error);
    });
  });
}

function downloadRecipeParserModel(app) {
  const destinationPath = getDefaultModelPath(app);
  return downloadFile(MODEL_URL, destinationPath, { minBytes: MIN_MODEL_BYTES });
}

function sanitizeParserResult(result) {
  if (!result || typeof result !== "object") {
    return errorResult("RECIPE_PARSE_FAILED", "Local recipe parser returned an invalid result.");
  }

  if (!result.success) {
    return {
      success: false,
      error: result.error || { code: "RECIPE_PARSE_FAILED", message: "Local recipe parser failed." },
      details: result.details?.expectedPath
        ? {
            downloadRequired: result.error?.code === "RECIPE_MODEL_NOT_FOUND",
            modelFile: MODEL_FILE,
            modelSizeBytes: MIN_MODEL_BYTES,
          }
        : undefined,
    };
  }

  return {
    success: true,
    recipe: result.recipe,
    quality: result.quality,
    timings: result.timings,
    status: result.status,
    model: {
      file: result.model?.file || MODEL_FILE,
      quantization: result.model?.quantization || "Q4_K_M",
      size_bytes: result.model?.size_bytes || null,
    },
    runtime: {
      engine: "llama.cpp",
      version: LLAMA_CPP_VERSION,
    },
  };
}

function sanitizeTranslationResult(result) {
  if (!result || typeof result !== "object") {
    return errorResult("RECIPE_TRANSLATION_FAILED", "Local recipe translation returned an invalid result.");
  }

  if (!result.success) {
    return {
      success: false,
      error: result.error || { code: "RECIPE_TRANSLATION_FAILED", message: "Local recipe translation failed." },
      details: result.details?.expectedPath
        ? {
            downloadRequired: result.error?.code === "RECIPE_MODEL_NOT_FOUND",
            modelFile: MODEL_FILE,
            modelSizeBytes: MIN_MODEL_BYTES,
          }
        : result.details,
    };
  }

  return {
    success: true,
    recipe: result.recipe,
    targetLanguage: result.targetLanguage,
    quality: result.quality,
    timings: result.timings,
    model: {
      file: result.model?.file || MODEL_FILE,
      quantization: result.model?.quantization || "Q4_K_M",
      size_bytes: result.model?.size_bytes || null,
    },
    runtime: {
      engine: "llama.cpp",
      version: LLAMA_CPP_VERSION,
    },
  };
}

function sanitizeDownloadResult(result) {
  return {
    success: true,
    model: {
      file: MODEL_FILE,
      size_bytes: result.bytes,
      sha256: result.sha256,
    },
  };
}

function registerLocalRecipeParserIpc(ipcMain, app) {
  ipcMain.handle(PARSE_RECIPE_TEXT_LOCAL_CHANNEL, async (_event, payload) => {
    const text = typeof payload?.text === "string" ? payload.text : "";
    const sourceLanguage = typeof payload?.sourceLanguage === "string" ? payload.sourceLanguage : undefined;
    const result = await parseRecipeTextLocal(app, { text, sourceLanguage });
    return sanitizeParserResult(result);
  });

  ipcMain.handle(PREPARE_RECIPE_MODEL_CHANNEL, async () => {
    try {
      const existing = resolveRecipeModel(app);
      if (existing.ok) {
        return {
          success: true,
          alreadyPresent: true,
          model: {
            file: path.basename(existing.modelPath),
            size_bytes: existing.size,
          },
        };
      }
      const result = await downloadRecipeParserModel(app);
      return sanitizeDownloadResult(result);
    } catch (error) {
      return errorResult(
        error instanceof LocalRecipeParserError ? error.code : "RECIPE_MODEL_DOWNLOAD_FAILED",
        error instanceof Error ? error.message : "Could not download local recipe model.",
      );
    }
  });

  ipcMain.handle(TRANSLATE_RECIPE_LOCAL_CHANNEL, async (_event, payload) => {
    const result = await translateRecipeLocal(app, payload);
    return sanitizeTranslationResult(result);
  });
}

module.exports = {
  LLAMA_CPP_VERSION,
  MODEL_FILE,
  MODEL_REPO,
  MODEL_URL,
  PARSE_RECIPE_TEXT_LOCAL_CHANNEL,
  PREPARE_RECIPE_MODEL_CHANNEL,
  TRANSLATE_RECIPE_LOCAL_CHANNEL,
  RECIPE_JSON_SCHEMA,
  LocalRecipeParserError,
  buildRecipeJsonGrammar,
  buildRecipeParserPrompt,
  downloadRecipeParserModel,
  extractTranscriptEvidence,
  buildQualityReport,
  buildCandidateRecipeLines,
  getDefaultModelPath,
  getRecipeParserModelDirectory,
  normalizeRecipeOutput,
  parseStructuredRecipeDraft,
  parseRecipeTextLocal,
  registerLocalRecipeParserIpc,
  resolveLlamaRuntime,
  resolveRecipeModel,
  translateRecipeLocal,
};
