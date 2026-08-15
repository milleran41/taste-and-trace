const fs = require("fs");
const path = require("path");

const {
  RECIPE_JSON_SCHEMA,
  parseRecipeTextLocal,
  resolveLlamaRuntime,
  resolveRecipeModel,
} = require("../electron/local-recipe-parser.cjs");

const projectRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(projectRoot, "tests", "fixtures", "local-recipe-parser");

const appStub = {
  getAppPath() {
    return projectRoot;
  },
  getPath(name) {
    if (name !== "userData") throw new Error(`Unsupported app path: ${name}`);
    return path.join(process.env.APPDATA || process.cwd(), "taste-and-trace");
  },
};

const expectedFacts = {
  numbers_en: ["300 g flour", "250 ml milk", "1/2 teaspoon salt", "180°C", "20 minutes", "2 eggs"],
  german: ["300 Gramm Mehl", "180 Grad", "20 Minuten"],
  russian: ["300 граммов муки", "половина чайной ложки", "180 градусов"],
  ambiguous: ["немного масла"],
};

function loadFixtures() {
  return fs
    .readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .map((name) => ({
      name: name.replace(/\.txt$/, ""),
      text: fs.readFileSync(path.join(fixturesDir, name), "utf8"),
    }));
}

function flattenRecipe(recipe) {
  return [
    recipe.title,
    recipe.description,
    ...(recipe.ingredients || []),
    ...(recipe.instructions || []),
    recipe.cooking_time,
    recipe.notes,
    recipe.category_hint,
    ...(recipe.tags || []),
  ]
    .join("\n")
    .toLowerCase();
}

function checkFacts(name, result) {
  const facts = expectedFacts[name] || [];
  if (!facts.length || !result.success) return [];
  const flat = flattenRecipe(result.recipe);
  return facts.filter((fact) => !flat.includes(fact.toLowerCase()));
}

async function main() {
  console.log("[local-recipe-parser] runtime:", resolveLlamaRuntime(appStub));
  console.log("[local-recipe-parser] model:", resolveRecipeModel(appStub));
  console.log("[local-recipe-parser] schema fields:", Object.keys(RECIPE_JSON_SCHEMA.properties));

  const fixtures = loadFixtures();
  const results = [];

  for (const fixture of fixtures) {
    const started = process.hrtime.bigint();
    const result = await parseRecipeTextLocal(appStub, { text: fixture.text });
    const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    const missingFacts = checkFacts(fixture.name, result);

    const summary = {
      fixture: fixture.name,
      success: result.success,
      code: result.success ? "OK" : result.error?.code,
      title: result.success ? result.recipe.title : "",
      ingredients: result.success ? result.recipe.ingredients.length : 0,
      instructions: result.success ? result.recipe.instructions.length : 0,
      input_chars: fixture.text.trim().length,
      wall_seconds: Number(wallSeconds.toFixed(2)),
      model_wall_seconds: result.timings?.wall_seconds ?? null,
      load_ms: result.timings?.load_ms ?? null,
      prompt_ms: result.timings?.prompt_ms ?? null,
      generation_ms: result.timings?.generation_ms ?? null,
      total_ms: result.timings?.total_ms ?? null,
      output_tokens: result.timings?.output_tokens ?? null,
      peak_working_set_mb: result.timings?.peak_working_set_bytes
        ? Math.round(result.timings.peak_working_set_bytes / 1024 / 1024)
        : null,
      missing_facts: missingFacts,
    };
    results.push(summary);
    console.log(JSON.stringify(summary, null, 2));
  }

  const outputDir = path.join(projectRoot, "tests", "results");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "local-recipe-parser-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
  console.log("[local-recipe-parser] wrote results:", outputPath);
}

main().catch((error) => {
  console.error("[local-recipe-parser] tests failed:", error);
  process.exitCode = 1;
});
