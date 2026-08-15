const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");

const RUNTIME_VERSION = "b10330";
const RUNTIME_ASSET = `llama-${RUNTIME_VERSION}-bin-win-cpu-x64.zip`;
const RUNTIME_URL = `https://github.com/ggml-org/llama.cpp/releases/download/${RUNTIME_VERSION}/${RUNTIME_ASSET}`;
const RUNTIME_SHA256 = "7c63d3650a210d423bfd4c77bfe6c945a8f164ae1198c5625576021faf4b8f68";
const RUNTIME_MIN_BYTES = 18_000_000;
const projectRoot = path.resolve(__dirname, "..");
const runtimeDir = path.join(projectRoot, "electron", "llama.cpp");
const archivePath = path.join(runtimeDir, RUNTIME_ASSET);

function download(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tempPath = `${destination}.tmp`;

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "TasteAndTraceLocalRecipeParser/1.0" } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const hash = crypto.createHash("sha256");
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        hash.update(chunk);
      });

      const file = fs.createWriteStream(tempPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          const sha256 = hash.digest("hex");
          if (bytes < RUNTIME_MIN_BYTES) {
            fs.rmSync(tempPath, { force: true });
            reject(new Error(`Runtime archive is too small: ${bytes}`));
            return;
          }
          if (sha256 !== RUNTIME_SHA256) {
            fs.rmSync(tempPath, { force: true });
            reject(new Error(`Runtime archive checksum mismatch: ${sha256}`));
            return;
          }
          fs.renameSync(tempPath, destination);
          resolve({ bytes, sha256 });
        });
      });
      file.on("error", reject);
    });
    request.on("error", reject);
  });
}

async function extractWithPowerShell(zipPath, destination) {
  const { spawn } = require("child_process");
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const command = `Expand-Archive -LiteralPath ${quote(zipPath)} -DestinationPath ${quote(destination)} -Force`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Expand-Archive failed with ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  console.log("[llama.cpp] version:", RUNTIME_VERSION);
  console.log("[llama.cpp] asset:", RUNTIME_ASSET);
  console.log("[llama.cpp] destination:", runtimeDir);

  const llamaCli = path.join(runtimeDir, "llama-cli.exe");
  if (fs.existsSync(llamaCli)) {
    cleanupRuntime();
    console.log("[llama.cpp] runtime already exists:", llamaCli);
    return;
  }

  const downloadResult = await download(RUNTIME_URL, archivePath);
  console.log("[llama.cpp] downloaded:", archivePath);
  console.log("[llama.cpp] size bytes:", downloadResult.bytes);
  console.log("[llama.cpp] sha256:", downloadResult.sha256);

  await extractWithPowerShell(archivePath, runtimeDir);
  if (!fs.existsSync(llamaCli)) {
    throw new Error("llama-cli.exe was not found after extraction.");
  }

  cleanupRuntime();

  console.log("[llama.cpp] ready:", llamaCli);
}

function cleanupRuntime() {
  const keepExact = new Set([
    "ggml-base.dll",
    "ggml.dll",
    "libomp140.x86_64.dll",
    "llama-cli-impl.dll",
    "llama-cli.exe",
    "llama-common.dll",
    "llama.dll",
    "llama.exe",
    "LICENSE",
    "LICENSE.md",
    "README.md",
    RUNTIME_ASSET,
  ]);

  const keepPatterns = [/^ggml-cpu.*\.dll$/i];

  const removable = [];

  for (const entry of fs.readdirSync(runtimeDir)) {
    const fullPath = path.join(runtimeDir, entry);
    const keep = keepExact.has(entry) || keepPatterns.some((pattern) => pattern.test(entry));
    if (fs.statSync(fullPath).isFile() && !keep) {
      removable.push(fullPath);
    }
  }

  for (const fullPath of removable) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      removeWithPowerShell(fullPath);
    }
  }
}

function removeWithPowerShell(fullPath) {
  const { spawnSync } = require("child_process");
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  spawnSync("powershell.exe", ["-NoProfile", "-Command", `Remove-Item -LiteralPath ${quote(fullPath)} -Force`], {
    windowsHide: true,
    stdio: "ignore",
  });
}

main().catch((error) => {
  console.error("[llama.cpp] setup failed:", error);
  process.exitCode = 1;
});
