const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const TRANSCRIBE_CHANNEL = "tasteTrace:transcribeYouTube";
const TRANSCRIBE_VIDEO_CHANNEL = "tasteTrace:transcribeVideo";
const EXTRACT_VIDEO_TEXT_CHANNEL = "tasteTrace:extractVideoText";
const EXTRACT_VIDEO_THUMBNAIL_CHANNEL = "tasteTrace:extractVideoThumbnail";
const TRANSCRIPTION_HEALTH_CHANNEL = "tasteTrace:getTranscriptionHealth";
const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_STDOUT_BYTES = 25 * 1024 * 1024;
const MAX_STDERR_BYTES = 2 * 1024 * 1024;

function errorResult(code, message) {
  return {
    success: false,
    error: { code, message },
  };
}

function validateVideoUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }

  try {
    const parsed = new URL(url.trim());
    return ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.hostname && parsed.hostname.includes("."));
  } catch {
    return false;
  }
}

function normalizeRequest(payload) {
  if (typeof payload === "string") {
    return { url: payload, language: undefined };
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return {
    type: payload.type,
    url: payload.url,
    path: payload.path || payload.filePath,
    name: payload.name,
    language: typeof payload.language === "string" ? payload.language : undefined,
  };
}

function validateLocalMediaPath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return false;
  }

  try {
    const resolved = path.resolve(filePath);
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

function normalizeLanguage(language) {
  if (language === undefined || language === null || language === "") {
    return undefined;
  }

  if (typeof language !== "string") {
    return null;
  }

  const normalized = language.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > 12 || !/^[a-z-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
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
  return decodeHtmlEntities(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function isLikelyWebPlatformPage(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return (
      host.endsWith("ok.ru") ||
      host.endsWith("instagram.com") ||
      host.endsWith("tiktok.com") ||
      host.endsWith("rutube.ru") ||
      host.endsWith("vk.com")
    );
  } catch {
    return false;
  }
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
  for (const item of extractJsonLdObjects(html)) {
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

  return pageUrl;
}

function fetchHtml(url, allowInsecureTls = false) {
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
          fetchHtml(new URL(response.headers.location, parsed).href, allowInsecureTls).then(resolve, reject);
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
    request.setTimeout(30000, () => request.destroy(new Error("Platform page request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

async function resolveVideoUrlForHelper(url) {
  if (!isLikelyWebPlatformPage(url)) return url;

  try {
    const html = await fetchHtml(url, false);
    return extractLinkedVideoUrl(html, url);
  } catch (error) {
    if (!String(error?.code || error?.message || "").match(/CERT|TLS|SSL|UNABLE_TO_VERIFY/i)) {
      console.warn("[video-thumbnail] platform page link resolution failed", error);
      return url;
    }
    try {
      const html = await fetchHtml(url, true);
      return extractLinkedVideoUrl(html, url);
    } catch (retryError) {
      console.warn("[video-thumbnail] insecure platform page link resolution failed", retryError);
      return url;
    }
  }
}

function uniqueExistingDirectories(candidates) {
  const result = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);

    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      result.push(resolved);
    }
  }

  return result;
}

function resolveTranscriptionHelper(app) {
  const appPath = typeof app.getAppPath === "function" ? app.getAppPath() : process.cwd();
  const sourceRoot = path.resolve(__dirname, "..");
  const executableDir = path.dirname(process.execPath);

  const productionHelpers = [
    path.join(process.resourcesPath || "", "transcription-helper", "transcription-helper.exe"),
    path.join(process.resourcesPath || "", "transcription-helper.exe"),
    path.join(executableDir, "resources", "transcription-helper", "transcription-helper.exe"),
  ];

  if (app.isPackaged) {
    const helperExe = productionHelpers.find((candidate) => candidate && fs.existsSync(candidate));
    if (helperExe) {
      return {
        ok: true,
        mode: "production",
        serviceDir: path.dirname(helperExe),
        executablePath: helperExe,
        args: [],
      };
    }
  }

  const serviceDirs = uniqueExistingDirectories([
    path.join(sourceRoot, "transcription-service"),
    path.join(appPath, "transcription-service"),
    path.join(process.resourcesPath || "", "transcription-service"),
    path.join(executableDir, "transcription-service"),
  ]);

  for (const serviceDir of serviceDirs) {
    const cliPath = path.join(serviceDir, "cli.py");
    if (!fs.existsSync(cliPath)) {
      continue;
    }

    const pythonCandidates =
      process.platform === "win32"
        ? [
            path.join(serviceDir, ".venv313", "Scripts", "python.exe"),
            path.join(serviceDir, ".venv", "Scripts", "python.exe"),
            path.join(serviceDir, "python", "python.exe"),
          ]
        : [
            path.join(serviceDir, ".venv313", "bin", "python"),
            path.join(serviceDir, ".venv", "bin", "python"),
            path.join(serviceDir, "python", "bin", "python"),
          ];

    const pythonPath = pythonCandidates.find((candidate) => fs.existsSync(candidate));
    if (pythonPath) {
      return {
        ok: true,
        mode: "development",
        serviceDir,
        executablePath: pythonPath,
        args: [path.basename(cliPath)],
      };
    }
  }

  return {
    ok: false,
    searched: [...productionHelpers, ...serviceDirs],
    message:
      app.isPackaged
        ? "Bundled transcription helper was not found in the app resources."
        : "Local transcription helper was not found. Expected transcription-service/.venv with Python next to the project or app.",
  };
}

function resolveModelDirectory(app) {
  const userData =
    app && typeof app.getPath === "function" ? app.getPath("userData") : path.join(process.cwd(), ".taste-trace-user-data");
  return path.join(userData, "models");
}

function safeParseTimeout() {
  const parsed = Number.parseInt(process.env.TRANSCRIPTION_TIMEOUT_MS || "", 10);
  if (Number.isFinite(parsed) && parsed >= 10000) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function runHelper(app, payload) {
  const helper = resolveTranscriptionHelper(app);
  if (!helper.ok) {
    console.warn("[transcription] helper missing", helper);
    return Promise.resolve(errorResult("HELPER_NOT_FOUND", helper.message));
  }

  const timeoutMs = safeParseTimeout();
  const started = process.hrtime.bigint();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const modelDir = resolveModelDirectory(app);
    fs.mkdirSync(modelDir, { recursive: true });

    const child = spawn(helper.executablePath, helper.args, {
      cwd: helper.serviceDir,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        WHISPER_MODEL: process.env.WHISPER_MODEL || "small",
        WHISPER_COMPUTE_TYPE: process.env.WHISPER_COMPUTE_TYPE || "int8",
        WHISPER_DEVICE: process.env.WHISPER_DEVICE || "cpu",
        WHISPER_LANGUAGE: process.env.WHISPER_LANGUAGE || "",
        WHISPER_MODEL_DIR: process.env.WHISPER_MODEL_DIR || modelDir,
        PYTHON_USE_SYSTEM_CERTS: process.env.PYTHON_USE_SYSTEM_CERTS || "true",
      },
    });

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const killForLimit = (code, message) => {
      try {
        child.kill("SIGKILL");
      } catch (error) {
        console.warn("[transcription] failed to kill helper", error);
      }
      finish(errorResult(code, message));
    };

    const timeout = setTimeout(() => {
      killForLimit("HELPER_TIMEOUT", "Local transcription helper timed out.");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_STDOUT_BYTES) {
        killForLimit("HELPER_OUTPUT_TOO_LARGE", "Local transcription response was too large.");
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (Buffer.byteLength(stderr, "utf8") > MAX_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_STDERR_BYTES);
      }
    });

    child.on("error", (error) => {
      console.warn("[transcription] failed to start helper", error);
      finish(errorResult("HELPER_START_FAILED", "Could not start local transcription helper."));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      const helperWallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      if (stderr.trim()) {
        console.warn("[transcription] helper stderr:", stderr.trim());
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (error) {
        console.warn("[transcription] invalid helper JSON", {
          code,
          error: error.message,
          stdoutPreview: stdout.slice(0, 500),
        });
        finish(errorResult("HELPER_INVALID_RESPONSE", "Local transcription helper returned invalid JSON."));
        return;
      }

      const totalSeconds = typeof parsed.total_seconds === "number" ? parsed.total_seconds : null;
      const overheadSeconds = totalSeconds === null ? null : Math.max(0, helperWallSeconds - totalSeconds);
      const result = {
        ...parsed,
        electron: {
          helper_wall_seconds: Number(helperWallSeconds.toFixed(2)),
          overhead_seconds: overheadSeconds === null ? null : Number(overheadSeconds.toFixed(2)),
          timeout_ms: timeoutMs,
          helper: helper.mode === "production" ? "bundled-exe" : "python-cli",
          model_dir: modelDir,
        },
      };

      finish(result);
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function runTranscription(app, payload) {
  const request = normalizeRequest(payload);
  if (!request) {
    return Promise.resolve(errorResult("INVALID_INPUT", "Video input is required."));
  }

  if (request.type === "file" || request.path) {
    if (!validateLocalMediaPath(request.path)) {
      return Promise.resolve(errorResult("INVALID_FILE", "Selected video file was not found."));
    }
    return runHelper(app, {
      mode: "transcribe-file",
      path: path.resolve(request.path),
      name: request.name || path.basename(request.path),
      language: request.language,
    });
  }

  if (!validateVideoUrl(request.url)) {
    return Promise.resolve(errorResult("INVALID_URL", "Only direct http(s) video URLs are accepted."));
  }

  return runHelper(app, { mode: "transcribe-video", url: request.url.trim() });
}

function getTranscriptionHealth(app) {
  return runHelper(app, { mode: "health" });
}

async function extractVideoText(app, payload) {
  const request = normalizeRequest(payload);
  if (!request || !validateVideoUrl(request.url)) {
    return errorResult("INVALID_URL", "Only direct http(s) video URLs are accepted.");
  }

  const url = request.url.trim();
  return runHelper(app, { mode: "extract-video-text", url, includeOcr: true });
}

async function extractVideoThumbnail(app, payload) {
  const request = normalizeRequest(payload);
  if (!request || !validateVideoUrl(request.url)) {
    return errorResult("INVALID_URL", "Only direct http(s) video URLs are accepted.");
  }

  const originalUrl = request.url.trim();
  const videoUrl = await resolveVideoUrlForHelper(originalUrl);
  const result = await runHelper(app, { mode: "extract-video-thumbnail", url: videoUrl });
  if (result && typeof result === "object") {
    return {
      ...result,
      sourceUrl: originalUrl,
      videoUrl,
    };
  }
  return result;
}

function registerTranscriptionIpc(ipcMain, app) {
  ipcMain.handle(TRANSCRIPTION_HEALTH_CHANNEL, () => getTranscriptionHealth(app));
  ipcMain.handle(TRANSCRIBE_VIDEO_CHANNEL, (_event, payload) => runTranscription(app, payload));
  ipcMain.handle(TRANSCRIBE_CHANNEL, (_event, payload) => runTranscription(app, payload));
  ipcMain.handle(EXTRACT_VIDEO_TEXT_CHANNEL, (_event, payload) => extractVideoText(app, payload));
  ipcMain.handle(EXTRACT_VIDEO_THUMBNAIL_CHANNEL, (_event, payload) => extractVideoThumbnail(app, payload));
}

module.exports = {
  EXTRACT_VIDEO_TEXT_CHANNEL,
  EXTRACT_VIDEO_THUMBNAIL_CHANNEL,
  TRANSCRIPTION_HEALTH_CHANNEL,
  TRANSCRIBE_CHANNEL,
  TRANSCRIBE_VIDEO_CHANNEL,
  extractVideoText,
  extractVideoThumbnail,
  getTranscriptionHealth,
  registerTranscriptionIpc,
  resolveTranscriptionHelper,
  runHelper,
  runTranscription,
  validateVideoUrl,
};
