const fs = require("fs");
const path = require("path");

const { extractTranscriptEvidence, parseRecipeTextLocal } = require("../electron/local-recipe-parser.cjs");

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

async function main() {
  const files = fs.readdirSync(fixturesDir).filter((name) => name.startsWith("negation_") && name.endsWith(".txt")).sort();
  const results = [];

  for (const file of files) {
    const text = fs.readFileSync(path.join(fixturesDir, file), "utf8");
    const evidence = extractTranscriptEvidence(text);
    const parsed = await parseRecipeTextLocal(appStub, { text });
    const warnings = parsed.quality?.warnings || [];
    const result = {
      fixture: file.replace(".txt", ""),
      negation_evidence_count: evidence.negations.length,
      negation_evidence: evidence.negations.map((item) => item.text),
      success: parsed.success,
      warning_codes: warnings.map((item) => item.code),
      quality: parsed.quality?.score || null,
      needs_review: parsed.quality?.needs_review ?? null,
    };
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const outputPath = path.join(projectRoot, "tests", "results", "local-recipe-parser-negation-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf8");
  console.log("[local-recipe-parser] wrote negation results:", outputPath);
}

main().catch((error) => {
  console.error("[local-recipe-parser] negation tests failed:", error);
  process.exitCode = 1;
});
