const fs = require("fs");
const path = require("path");

const {
  MODEL_FILE,
  MODEL_REPO,
  MODEL_URL,
  downloadRecipeParserModel,
  getDefaultModelPath,
  getRecipeParserModelDirectory,
} = require("../electron/local-recipe-parser.cjs");

const appStub = {
  getPath(name) {
    if (name !== "userData") throw new Error(`Unsupported app path: ${name}`);
    return path.join(process.env.APPDATA || process.cwd(), "taste-and-trace");
  },
};

async function main() {
  const modelPath = getDefaultModelPath(appStub);
  const modelDir = getRecipeParserModelDirectory(appStub);

  console.log("[local-recipe-parser] model repo:", MODEL_REPO);
  console.log("[local-recipe-parser] model file:", MODEL_FILE);
  console.log("[local-recipe-parser] model URL:", MODEL_URL);
  console.log("[local-recipe-parser] model directory:", modelDir);

  if (fs.existsSync(modelPath)) {
    const stat = fs.statSync(modelPath);
    console.log("[local-recipe-parser] model already exists:", modelPath);
    console.log("[local-recipe-parser] size bytes:", stat.size);
    return;
  }

  const result = await downloadRecipeParserModel(appStub);
  console.log("[local-recipe-parser] downloaded:", result.path);
  console.log("[local-recipe-parser] size bytes:", result.bytes);
  console.log("[local-recipe-parser] sha256:", result.sha256);
}

main().catch((error) => {
  console.error("[local-recipe-parser] download failed:", error);
  process.exitCode = 1;
});
