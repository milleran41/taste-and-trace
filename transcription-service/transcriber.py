import os
import base64
import io
import shutil
import subprocess
import sys
import tempfile
import time
import json
import re
import urllib.request
import urllib.error
from difflib import SequenceMatcher
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from yt_dlp import YoutubeDL

load_dotenv()


APP_NAME = "Taste & Trace Transcription Service"
ENGINE = "faster-whisper"


def configure_bundled_ffmpeg() -> str | None:
    explicit_path = os.getenv("FFMPEG_BINARY") or os.getenv("FFMPEG_PATH")
    candidates: list[Path] = []
    if explicit_path:
        candidates.append(Path(explicit_path))

    base_dirs = [
        Path(__file__).resolve().parent,
        Path(sys.executable).resolve().parent,
    ]
    pyinstaller_root = getattr(sys, "_MEIPASS", None)
    if pyinstaller_root:
        base_dirs.append(Path(pyinstaller_root))

    for base_dir in base_dirs:
        candidates.extend(
            [
                base_dir / "ffmpeg.exe",
                base_dir / "bin" / "ffmpeg.exe",
                base_dir / "ffmpeg" / "ffmpeg.exe",
                base_dir / "ffmpeg" / "bin" / "ffmpeg.exe",
                base_dir / "vendor" / "ffmpeg" / "bin" / "ffmpeg.exe",
            ]
        )

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            ffmpeg_path = str(candidate.resolve())
            ffmpeg_dir = str(candidate.resolve().parent)
            path_entries = os.getenv("PATH", "").split(os.pathsep)
            if ffmpeg_dir not in path_entries:
                os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.getenv("PATH", "")
            os.environ.setdefault("IMAGEIO_FFMPEG_EXE", ffmpeg_path)
            os.environ.setdefault("FFMPEG_BINARY", ffmpeg_path)
            return ffmpeg_path

    return None


def configure_system_cert_store() -> bool:
    if os.getenv("PYTHON_USE_SYSTEM_CERTS", "true").lower() == "false":
        return False

    try:
        import truststore

        truststore.inject_into_ssl()
        return True
    except Exception:
        return False


SYSTEM_CERTS_ENABLED = configure_system_cert_store()
BUNDLED_FFMPEG_PATH = configure_bundled_ffmpeg()


class Settings(BaseModel):
    whisper_model: str = Field(default_factory=lambda: os.getenv("WHISPER_MODEL", "small"))
    whisper_model_dir: str | None = Field(default_factory=lambda: os.getenv("WHISPER_MODEL_DIR") or None)
    whisper_compute_type: str = Field(default_factory=lambda: os.getenv("WHISPER_COMPUTE_TYPE", "int8"))
    whisper_device: str = Field(default_factory=lambda: os.getenv("WHISPER_DEVICE", "cpu"))
    whisper_language: str | None = Field(default_factory=lambda: os.getenv("WHISPER_LANGUAGE") or None)
    api_token: str | None = Field(default_factory=lambda: os.getenv("TRANSCRIPTION_API_TOKEN") or None)
    max_video_duration_minutes: float = Field(
        default_factory=lambda: float(os.getenv("MAX_VIDEO_DURATION_MINUTES", "30"))
    )
    vad_filter: bool = Field(default_factory=lambda: os.getenv("WHISPER_VAD_FILTER", "true").lower() != "false")
    ytdlp_no_check_certificate: bool = Field(
        default_factory=lambda: os.getenv("YTDLP_NO_CHECK_CERTIFICATE", "false").lower() == "true"
    )


class TranscriptionError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


settings = Settings()
_model: Any | None = None
_model_lock = Lock()
_last_model_load_seconds = 0.0


class QuietYtdlpLogger:
    def debug(self, msg: str) -> None:
        pass

    def warning(self, msg: str) -> None:
        pass

    def error(self, msg: str) -> None:
        pass


def error_payload(code: str, message: str) -> dict[str, Any]:
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
        },
    }


def is_allowed_youtube_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False

    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]

    if host == "youtu.be":
        return bool(parsed.path.strip("/"))

    if host not in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        return False

    if parsed.path == "/watch":
        return bool(parse_qs(parsed.query).get("v"))

    return parsed.path.startswith(("/shorts/", "/embed/"))


def is_allowed_video_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False

    host = (parsed.hostname or "").lower()
    return bool(host and "." in host)


def normalize_language_hint(language: str | None) -> str | None:
    if not language:
        return None

    normalized = language.strip().lower().replace("_", "-")
    if not normalized:
        return None

    if len(normalized) > 12 or not all(char.isalpha() or char == "-" for char in normalized):
        raise TranscriptionError(400, "INVALID_LANGUAGE", "Language must be a short Whisper language code.")

    return normalized


def get_model() -> Any:
    global _model, _last_model_load_seconds
    if _model is not None:
        _last_model_load_seconds = 0.0
        return _model

    with _model_lock:
        if _model is None:
            started = time.perf_counter()
            try:
                from faster_whisper import WhisperModel

                _model = WhisperModel(
                    settings.whisper_model,
                    device=settings.whisper_device,
                    compute_type=settings.whisper_compute_type,
                    download_root=settings.whisper_model_dir,
                )
            except Exception as exc:
                message = "Whisper model could not be downloaded or loaded."
                if settings.whisper_model_dir:
                    message += f" Model directory: {settings.whisper_model_dir}"
                error_text = str(exc).lower()
                download_markers = (
                    "download",
                    "huggingface",
                    "hf hub",
                    "connection",
                    "timeout",
                    "resolve",
                    "offline",
                )
                code = "MODEL_DOWNLOAD_FAILED" if any(marker in error_text for marker in download_markers) else "MODEL_LOAD_FAILED"
                raise TranscriptionError(500, code, message) from exc
            _last_model_load_seconds = time.perf_counter() - started
    return _model


def get_last_model_load_seconds() -> float:
    return _last_model_load_seconds


def is_certificate_error(exc: Exception) -> bool:
    error_text = str(exc).lower()
    return (
        "certificate_verify_failed" in error_text
        or "certificate verify failed" in error_text
        or "unable to get local issuer certificate" in error_text
        or "ssl" in error_text and "certificate" in error_text
    )


def request_text(url: str, referer: str | None = None) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read()
            if body:
                return body.decode("utf-8", errors="replace")
        except Exception:
            pass
        try:
            import requests

            response = requests.get(url, headers=headers, timeout=30, allow_redirects=True)
            response.raise_for_status()
            return response.text
        except Exception:
            raise exc


def decode_escaped_url(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except Exception:
        return value.replace("\\/", "/").replace("\\u0026", "&")


def is_ok_video_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host == "ok.ru" or host.endswith(".ok.ru") or host == "odnoklassniki.ru" or host.endswith(".odnoklassniki.ru")


def is_vkvideo_embed_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
    except Exception:
        return False
    return (host == "vkvideo.ru" or host.endswith(".vkvideo.ru") or host == "vk.com" or host.endswith(".vk.com")) and parsed.path.endswith("/video_ext.php")


def extract_vkvideo_embed_urls(text: str) -> list[str]:
    normalized = text.replace("\\/", "/").replace("&amp;", "&")
    matches = re.findall(
        r"https?://(?:www\.)?vkvideo\.ru/video_ext\.php\?oid=[^&\"'<>\s]+&id=[^&\"'<>\s]+&hash=[^&\"'<>\s]+",
        normalized,
    )
    urls: list[str] = []
    for match in matches:
        decoded = decode_escaped_url(match).replace("&amp;", "&")
        if decoded not in urls:
            urls.append(decoded)
    return urls


def parse_vk_embed_streams(embed_html: str) -> list[dict[str, Any]]:
    formats: list[dict[str, Any]] = []
    seen: set[str] = set()
    for format_id, _, raw_url in re.findall(r'"(mp4_(\d+)|hls|hls_fmp4|dash_sep|dash_webm)"\s*:\s*"(https?:\\?/\\?/[^"]+)"', embed_html):
        stream_url = decode_escaped_url(raw_url).replace("&amp;", "&")
        if stream_url in seen:
            continue
        seen.add(stream_url)
        height_match = re.search(r"mp4_(\d+)", format_id)
        height = int(height_match.group(1)) if height_match else None
        protocol = "m3u8_native" if "m3u8" in stream_url or format_id.startswith("hls") else None
        formats.append({
            "format_id": format_id,
            "url": stream_url,
            "ext": "mp4",
            "height": height,
            "vcodec": "unknown",
            "acodec": "unknown",
            **({"protocol": protocol} if protocol else {}),
        })
    return formats


def parse_vk_embed_thumbnail(embed_html: str) -> str:
    image_match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', embed_html, re.I)
    if image_match:
        return image_match.group(1).replace("&amp;", "&")
    thumbs = re.findall(r'"url"\s*:\s*"(https?:\\?/\\?/[^"]+\.(?:jpg|jpeg|png)[^"]*)"', embed_html, re.I)
    return decode_escaped_url(thumbs[-1]).replace("&amp;", "&") if thumbs else ""


def parse_vk_embed_title(embed_html: str) -> str:
    title_match = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', embed_html, re.I)
    if not title_match:
        title_match = re.search(r"<title[^>]*>(.*?)</title>", embed_html, re.I | re.S)
    if not title_match:
        return ""
    return clean_platform_text(re.sub(r"<[^>]+>", " ", title_match.group(1))).replace("&quot;", '"').replace("&amp;", "&")


def is_generic_video_title(title: str | None) -> bool:
    normalized = clean_platform_text(title or "").strip().lower()
    return normalized in {"video", "video embed", "ok video", "vk video", "видео"}


def parse_vk_embed_duration(embed_html: str) -> float:
    duration_match = re.search(r'"duration"\s*:\s*(\d+(?:\.\d+)?)', embed_html)
    if duration_match:
        return float(duration_match.group(1))
    du_match = re.search(r"[?&]du=(\d+)", embed_html)
    if du_match:
        value = float(du_match.group(1))
        return value / 1000 if value > 1000 else value
    return 0.0


def get_ok_vk_embed_info(url: str, original_error: Exception) -> dict[str, Any] | None:
    is_ok_url = is_ok_video_url(url)
    is_vk_embed_url = is_vkvideo_embed_url(url)
    if not is_ok_url and not is_vk_embed_url:
        return None

    candidates = [url] if is_vk_embed_url else []
    candidates.extend(item for item in extract_vkvideo_embed_urls(str(original_error)) if item not in candidates)
    if is_ok_url:
        try:
            ok_html = request_text(url)
            candidates.extend(item for item in extract_vkvideo_embed_urls(ok_html) if item not in candidates)
        except Exception:
            ok_html = ""
    else:
        ok_html = ""

    for embed_url in candidates:
        try:
            embed_html = request_text(embed_url, referer=url if is_ok_url else "https://ok.ru/")
        except Exception:
            continue
        formats = parse_vk_embed_streams(embed_html)
        if not formats:
            continue
        best = pick_best_video_format({"formats": formats}) or formats[0]
        ok_title = parse_vk_embed_title(ok_html)
        embed_title = parse_vk_embed_title(embed_html)
        title = ok_title if ok_title and not is_generic_video_title(ok_title) else ""
        if not title and embed_title and not is_generic_video_title(embed_title):
            title = embed_title
        return {
            "id": parse_qs(urlparse(embed_url).query).get("id", ["ok-vk-embed"])[0],
            "title": title or "OK video",
            "description": "",
            "duration": parse_vk_embed_duration(embed_html),
            "thumbnail": parse_vk_embed_thumbnail(embed_html),
            "webpage_url": url,
            "extractor_key": "OdnoklassnikiVkEmbed",
            "formats": formats,
            "url": best.get("url"),
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Referer": embed_url,
            },
        }
    return None


def get_video_info(url: str) -> dict[str, Any]:
    def read_info(no_check_certificate: bool) -> dict[str, Any]:
        options = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_download": True,
            "logger": QuietYtdlpLogger(),
            "nocheckcertificate": no_check_certificate,
        }
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
            if not isinstance(info, dict):
                raise TranscriptionError(422, "METADATA_FAILED", "Could not read video metadata.")
            return info

    preflight_info = get_ok_vk_embed_info(url, Exception(""))
    if preflight_info:
        return preflight_info

    try:
        return read_info(settings.ytdlp_no_check_certificate)
    except Exception as exc:
        fallback_info = get_ok_vk_embed_info(url, exc)
        if fallback_info:
            return fallback_info
        if settings.ytdlp_no_check_certificate or not is_certificate_error(exc):
            raise
        try:
            return read_info(True)
        except Exception as retry_exc:
            fallback_info = get_ok_vk_embed_info(url, retry_exc)
            if fallback_info:
                return fallback_info
            raise


def clean_platform_text(value: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", value.replace("\r\n", "\n").replace("\r", "\n"))).strip()


def parse_json3_captions(raw: str) -> str:
    parsed = json.loads(raw)
    chunks: list[str] = []
    for event in parsed.get("events") or []:
        for seg in event.get("segs") or []:
            text = seg.get("utf8")
            if text:
                chunks.append(text)
    return clean_platform_text(" ".join(chunks))


def parse_vtt_captions(raw: str) -> str:
    lines: list[str] = []
    for line in raw.replace("\ufeff", "").splitlines():
        trimmed = line.strip()
        if (
            not trimmed
            or trimmed == "WEBVTT"
            or "-->" in trimmed
            or re.match(r"^(Kind|Language):", trimmed, re.I)
            or re.match(r"^\d+$", trimmed)
        ):
            continue
        lines.append(re.sub(r"<[^>]+>", " ", trimmed))
    return clean_platform_text(" ".join(lines))


def parse_xml_captions(raw: str) -> str:
    return clean_platform_text(re.sub(r"<[^>]+>", " ", raw))


def parse_caption_response(raw: str, ext: str | None) -> str:
    trimmed = raw.strip()
    if not trimmed:
        return ""
    if ext == "json3" or trimmed.startswith("{"):
        return parse_json3_captions(trimmed)
    if ext == "vtt" or trimmed.startswith("WEBVTT"):
        return parse_vtt_captions(trimmed)
    return parse_xml_captions(trimmed)


def fetch_caption_text(caption: dict[str, Any]) -> str:
    caption_url = caption.get("url")
    if not isinstance(caption_url, str) or not caption_url:
        return ""

    request = urllib.request.Request(
        caption_url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            "Accept": "text/vtt,application/json,text/xml,text/plain,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return parse_caption_response(raw, caption.get("ext"))


def infer_caption_language_from_text(info: dict[str, Any]) -> str | None:
    text = clean_platform_text(" ".join([str(info.get("title") or ""), str(info.get("description") or "")]))
    if not text:
        return None

    latin_letters = len(re.findall(r"[A-Za-z]", text))
    cyrillic_letters = len(re.findall(r"[А-Яа-яЁё]", text))
    if latin_letters >= 20 and latin_letters >= cyrillic_letters * 3:
        return "en"
    if cyrillic_letters >= 20 and cyrillic_letters >= latin_letters * 3:
        return "ru"
    return None


def caption_language_rank(language: str, preferred_language: str | None, original_language: str | None) -> int:
    normalized = (language or "").lower().replace("_", "-")
    preferred = (preferred_language or "").lower().replace("_", "-")
    original = (original_language or "").lower().replace("_", "-")
    if preferred and normalized == f"{preferred}-orig":
        return 0
    if preferred and normalized == preferred:
        return 1
    if preferred and normalized.startswith(f"{preferred}-"):
        return 2
    if original and normalized == f"{original}-orig":
        return 3
    if original and normalized == original:
        return 4
    if original and normalized.startswith(f"{original}-"):
        return 5
    if normalized == "en-orig":
        return 6
    if normalized == "en":
        return 7
    if normalized.startswith("en-"):
        return 8
    return 10


def iter_caption_candidates(info: dict[str, Any], preferred_language: str | None) -> list[tuple[str, str, dict[str, Any]]]:
    inferred_language = infer_caption_language_from_text(info)
    original_language = inferred_language or info.get("language") or info.get("original_language")
    candidates: list[tuple[str, str, dict[str, Any]]] = []

    for source, group in (("manual", info.get("subtitles") or {}), ("automatic", info.get("automatic_captions") or {})):
        if not isinstance(group, dict):
            continue
        for language, captions in sorted(
            group.items(),
            key=lambda item: caption_language_rank(item[0], preferred_language, original_language),
        ):
            if not isinstance(captions, list):
                continue
            for caption in captions:
                if isinstance(caption, dict) and caption.get("url"):
                    candidates.append((source, language, caption))
    return candidates


def detect_video_platform(url: str, info: dict[str, Any]) -> str:
    extractor = str(info.get("extractor_key") or info.get("extractor") or "").lower()
    if extractor:
        return extractor

    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        host = ""
    if host.startswith("www."):
        host = host[4:]
    if host.endswith("youtube.com") or host == "youtu.be":
        return "youtube"
    if host.endswith("ok.ru"):
        return "ok"
    if host.endswith("instagram.com"):
        return "instagram"
    return host.split(".")[-2] if "." in host else "video"


def pick_best_video_format(info: dict[str, Any]) -> dict[str, Any] | None:
    formats = [item for item in info.get("formats") or [] if isinstance(item, dict) and item.get("url")]
    video_formats = [
        item
        for item in formats
        if item.get("vcodec") not in {None, "none"} and (item.get("height") or 0) >= 240
    ]
    if not video_formats:
        return info if info.get("url") else None

    def score(item: dict[str, Any]) -> tuple[int, int, int]:
        height = int(item.get("height") or 0)
        width = int(item.get("width") or 0)
        has_audio = 1 if item.get("acodec") not in {None, "none"} else 0
        # OCR does not need 4K. Prefer a readable but not huge stream.
        readable_height = min(height, 720)
        return (readable_height, has_audio, width)

    return max(video_formats, key=score)


def normalize_ocr_line_for_match(value: str) -> str:
    normalized = value.lower().replace("ё", "е")
    normalized = re.sub(r"(\d)\s+([a-zа-я])", r"\1\2", normalized)
    normalized = re.sub(r"([a-zа-я])\s+(\d)", r"\1\2", normalized)
    normalized = re.sub(r"[^0-9a-zа-я]+", "", normalized)
    return normalized


def is_similar_ocr_line(left: str, right: str) -> bool:
    left_key = normalize_ocr_line_for_match(left)
    right_key = normalize_ocr_line_for_match(right)
    if not left_key or not right_key:
        return False
    if left_key == right_key:
        return True
    if left_key in right_key or right_key in left_key:
        return min(len(left_key), len(right_key)) >= 4
    return SequenceMatcher(None, left_key, right_key).ratio() >= 0.88


def dedupe_ocr_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    recent_window = 8
    for event in events:
        text = clean_platform_text(str(event.get("text") or ""))
        if not text:
            continue
        duplicate_index: int | None = None
        for index, existing in enumerate(deduped[-recent_window:]):
            if is_similar_ocr_line(str(existing.get("text") or ""), text):
                duplicate_index = len(deduped) - min(len(deduped), recent_window) + index
                break
        if duplicate_index is not None:
            deduped[duplicate_index]["lastTimestamp"] = event.get("timestamp")
            continue
        deduped.append({**event, "text": text})
    return deduped


def clean_ocr_line(value: str) -> str:
    cleaned = clean_platform_text(
        str(value or "")
        .replace("|", " ")
        .replace("\\", " ")
        .replace("[", " ")
        .replace("]", " ")
        .replace("{", " ")
        .replace("}", " ")
        .replace("_", " ")
    )
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" .,:;~`'\"")
    return cleaned


def is_likely_ocr_text_line(value: str) -> bool:
    text = clean_ocr_line(value)
    if not text:
        return False
    letters = re.findall(r"[\p{L}]", text) if False else re.findall(r"[A-Za-zА-Яа-яЁё]", text)
    digits = re.findall(r"\d", text)
    meaningful = len(letters) + len(digits)
    if meaningful < 2:
        return False
    if meaningful < 3 and not digits:
        return False
    if meaningful / max(1, len(text)) < 0.35:
        return False
    return True


def iter_ocr_image_variants(image: Any, pil_modules: tuple[Any, Any]) -> list[tuple[str, Any]]:
    ImageOps, ImageEnhance = pil_modules
    width, height = image.size
    regions = [
        ("full", (0, 0, width, height)),
        ("center", (0, int(height * 0.20), width, int(height * 0.80))),
        ("lower", (0, int(height * 0.45), width, height)),
        ("upper", (0, 0, width, int(height * 0.55))),
    ]
    variants: list[tuple[str, Any]] = []
    for name, box in regions:
        cropped = image.crop(box)
        processed = ImageOps.grayscale(cropped)
        processed = ImageEnhance.Contrast(processed).enhance(2.2)
        processed = processed.resize((processed.width * 2, processed.height * 2))
        variants.append((name, processed))
    return variants


def resolve_tesseract_executable() -> str | None:
    configured = os.getenv("TESSERACT_EXE") or os.getenv("TESSERACT_PATH")
    candidates = [
        configured,
        shutil.which("tesseract"),
        str(Path(__file__).resolve().parent / "tesseract" / "tesseract.exe"),
        str(Path(__file__).resolve().parent / "bin" / "tesseract.exe"),
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def get_tesseract_languages(tesseract: str) -> set[str]:
    try:
        completed = subprocess.run(
            [tesseract, "--list-langs"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
    except Exception:
        return {"eng"}
    if completed.returncode != 0:
        return {"eng"}
    languages = {
        line.strip()
        for line in completed.stdout.splitlines()
        if line.strip() and not line.lower().startswith("list of available")
    }
    return languages or {"eng"}


def tesseract_language_options(language_hint: str | None, tesseract: str) -> list[str]:
    language = (language_hint or "").split("-")[0].lower()
    mapping = {
        "ru": ["rus", "eng"],
        "de": ["deu", "eng"],
        "en": "eng",
        "es": ["spa", "eng"],
        "fr": ["fra", "eng"],
        "it": ["ita", "eng"],
        "pt": ["por", "eng"],
        "ka": ["kat", "eng"],
    }
    requested_value = mapping.get(language, ["rus", "eng", "deu", "spa", "fra"])
    requested = requested_value if isinstance(requested_value, list) else [requested_value]
    available = get_tesseract_languages(tesseract)
    picked = [item for item in requested if item in available]
    if not picked and "eng" in available:
        picked = ["eng"]
    if not picked:
        picked = sorted(available)[:1]
    return picked


def download_video_for_ocr(url: str, temp_dir: Path, info: dict[str, Any] | None = None) -> Path:
    attempts: list[dict[str, Any]] = []
    if info:
        for index, item in enumerate(media_download_attempts_from_info(info)[:4]):
            attempts.append({
                **item,
                "format": "best[height<=720]/best",
                "outtmpl": str(temp_dir / f"ocr-{item['name']}-%(id)s.%(ext)s"),
            })
    attempts.append({
        "name": "original-url",
        "url": url,
        "format": "best[height<=720]/best",
        "outtmpl": str(temp_dir / "ocr-video.%(ext)s"),
        "http_headers": None,
    })

    errors: list[str] = []
    for attempt in attempts:
        options = {
            "format": attempt["format"],
            "outtmpl": attempt["outtmpl"],
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "retries": 2,
            "fragment_retries": 2,
            "logger": QuietYtdlpLogger(),
            "nocheckcertificate": settings.ytdlp_no_check_certificate,
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
            },
        }
        if attempt.get("http_headers"):
            options["http_headers"].update(attempt["http_headers"])
        ffmpeg_path = BUNDLED_FFMPEG_PATH or shutil.which("ffmpeg")
        if ffmpeg_path:
            options["ffmpeg_location"] = str(Path(ffmpeg_path).resolve().parent)

        before = {item.resolve() for item in temp_dir.iterdir()}
        try:
            with YoutubeDL(options) as ydl:
                ydl.extract_info(attempt.get("url") or url, download=True)
        except Exception as exc:
            errors.append(f"{attempt['name']}: {exc}")
            continue

        after = [item for item in temp_dir.iterdir() if item.resolve() not in before and item.is_file() and item.stat().st_size > 0]
        if after:
            return max(after, key=lambda item: item.stat().st_size)
        errors.append(f"{attempt['name']}: no video file was created")

    raise RuntimeError("Video file was not downloaded for OCR. " + " | ".join(errors[-4:]))


def sample_video_ocr(url: str, info: dict[str, Any], language_hint: str | None = None) -> dict[str, Any]:
    started = time.perf_counter()
    tesseract = resolve_tesseract_executable()
    if not tesseract:
        return {
            "success": False,
            "text": "",
            "events": [],
            "engine": "tesseract",
            "error": {
                "code": "OCR_ENGINE_NOT_FOUND",
                "message": "Tesseract OCR runtime was not found.",
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    try:
        import av
        from PIL import Image, ImageEnhance, ImageOps
    except Exception as exc:
        return {
            "success": False,
            "text": "",
            "events": [],
            "engine": "tesseract",
            "error": {
                "code": "VIDEO_FRAME_RUNTIME_NOT_FOUND",
                "message": f"Video frame runtime is not available: {exc}",
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    picked_format = pick_best_video_format(info)
    stream_url = picked_format.get("url") if picked_format else info.get("url")
    if not isinstance(stream_url, str) or not stream_url:
        return {
            "success": False,
            "text": "",
            "events": [],
            "engine": "tesseract",
            "error": {
                "code": "VIDEO_STREAM_NOT_FOUND",
                "message": "No readable video stream was found for OCR.",
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    duration = float(info.get("duration") or 0)
    if duration <= 0:
        duration = 60.0
    interval = 1.0 if duration <= 180 else 2.0
    max_frames = 80
    target_timestamps = [round(value, 2) for value in frange(0.0, min(duration, interval * max_frames), interval)]
    languages = tesseract_language_options(language_hint, tesseract)
    raw_events: list[dict[str, Any]] = []

    try:
        next_target_index = 0
        with tempfile.TemporaryDirectory(prefix="taste-trace-ocr-") as temp_dir:
            temp_path = Path(temp_dir)
            try:
                container = av.open(stream_url, timeout=30)
            except Exception:
                local_video = download_video_for_ocr(url, temp_path, info)
                container = av.open(str(local_video))

            video_stream = next((stream for stream in container.streams if stream.type == "video"), None)
            if video_stream is None:
                raise RuntimeError("No video stream in container.")

            try:
                for frame in container.decode(video_stream):
                    if next_target_index >= len(target_timestamps):
                        break
                    timestamp = float(frame.time or 0)
                    if timestamp + 0.05 < target_timestamps[next_target_index]:
                        continue

                    image = frame.to_image()
                    image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                    for variant_name, ocr_image in iter_ocr_image_variants(image, (ImageOps, ImageEnhance)):
                        frame_path = temp_path / f"frame-{next_target_index:04d}-{variant_name}.png"
                        ocr_image.save(frame_path)

                        for language in languages:
                            completed = subprocess.run(
                                [tesseract, str(frame_path), "stdout", "-l", language, "--psm", "11"],
                                capture_output=True,
                                text=True,
                                encoding="utf-8",
                                errors="replace",
                                timeout=20,
                            )
                            if completed.returncode == 0:
                                text = clean_platform_text(completed.stdout)
                                for line in text.splitlines():
                                    line = clean_ocr_line(line)
                                    if is_likely_ocr_text_line(line):
                                        raw_events.append({"timestamp": round(timestamp, 2), "text": line})
                    next_target_index += 1
            finally:
                container.close()
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "text": "",
            "events": dedupe_ocr_events(raw_events),
            "engine": "tesseract",
            "error": {
                "code": "OCR_TIMEOUT",
                "message": "OCR took too long and was stopped.",
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }
    except Exception as exc:
        return {
            "success": False,
            "text": "",
            "events": dedupe_ocr_events(raw_events),
            "engine": "tesseract",
            "error": {
                "code": "VIDEO_OCR_FAILED",
                "message": str(exc),
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    events = dedupe_ocr_events(raw_events)
    text = "\n".join(f"[{format_timestamp(event.get('timestamp'))}] {event.get('text')}" for event in events)
    return {
        "success": True,
        "text": text,
        "events": events,
        "engine": "tesseract",
        "sampleIntervalSeconds": interval,
        "framesSampled": len(target_timestamps),
        "total_seconds": round(time.perf_counter() - started, 2),
    }


def thumbnail_candidate_timestamps(duration: float) -> list[float]:
    if duration <= 0:
        duration = 30.0
    raw_values = [1.0, 3.0, duration * 0.05, duration * 0.10, duration * 0.20]
    max_time = max(0.25, duration - 0.1)
    values: list[float] = []
    for value in raw_values:
        bounded = round(min(max_time, max(0.0, float(value))), 2)
        if bounded not in values:
            values.append(bounded)
    return sorted(values)


def score_thumbnail_frame(image: Any, pil_modules: tuple[Any, Any]) -> dict[str, Any]:
    _image_stat, _image = pil_modules
    rgb_image = image.convert("RGB")
    gray_image = rgb_image.convert("L")
    gray_stat = _image_stat.Stat(gray_image)
    rgb_stat = _image_stat.Stat(rgb_image)
    brightness = float(gray_stat.mean[0])
    contrast = float(gray_stat.stddev[0])
    channel_spread = float(max(rgb_stat.mean) - min(rgb_stat.mean))
    entropy = float(gray_image.entropy())
    width, height = rgb_image.size
    rejected = (
        width < 160
        or height < 90
        or brightness < 18
        or brightness > 242
        or contrast < 9
        or entropy < 2.8
    )
    score = (contrast * 2.0) + (entropy * 12.0) + (channel_spread * 0.25) - abs(brightness - 128) * 0.12
    return {
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "entropy": round(entropy, 2),
        "channelSpread": round(channel_spread, 2),
        "width": width,
        "height": height,
        "rejected": rejected,
        "score": round(score, 2),
    }


def encode_thumbnail_image(image: Any) -> str:
    rgb_image = image.convert("RGB")
    output = io.BytesIO()
    rgb_image.save(output, format="JPEG", quality=82, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def extract_video_thumbnail(url: str) -> dict[str, Any]:
    started = time.perf_counter()
    if not isinstance(url, str) or not url.strip():
        raise TranscriptionError(422, "INVALID_URL", "Video URL is required.")

    try:
        import av
        from PIL import Image, ImageStat
    except Exception as exc:
        return {
            "success": False,
            "error": {
                "code": "VIDEO_FRAME_RUNTIME_NOT_FOUND",
                "message": f"Video frame runtime is not available: {exc}",
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    info = get_video_info(url)
    picked_format = pick_best_video_format(info)
    stream_url = picked_format.get("url") if picked_format else info.get("url")
    if not isinstance(stream_url, str) or not stream_url:
        return {
            "success": False,
            "error": {
                "code": "VIDEO_STREAM_NOT_FOUND",
                "message": "No readable video stream was found for thumbnail extraction.",
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    duration = float(info.get("duration") or 0)
    target_timestamps = thumbnail_candidate_timestamps(duration)
    candidates: list[dict[str, Any]] = []

    try:
        next_target_index = 0
        with tempfile.TemporaryDirectory(prefix="taste-trace-thumbnail-") as temp_dir:
            temp_path = Path(temp_dir)
            try:
                container = av.open(stream_url, timeout=30)
            except Exception:
                local_video = download_video_for_ocr(url, temp_path, info)
                container = av.open(str(local_video))

            video_stream = next((stream for stream in container.streams if stream.type == "video"), None)
            if video_stream is None:
                raise RuntimeError("No video stream in container.")

            try:
                for frame in container.decode(video_stream):
                    if next_target_index >= len(target_timestamps):
                        break
                    timestamp = float(frame.time or 0)
                    if timestamp + 0.05 < target_timestamps[next_target_index]:
                        continue

                    image = frame.to_image()
                    image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                    stats = score_thumbnail_frame(image, (ImageStat, Image))
                    candidate = {
                        "timestamp": round(timestamp, 2),
                        "stats": stats,
                        "image": image.copy(),
                    }
                    candidates.append(candidate)
                    if not stats["rejected"]:
                        break
                    next_target_index += 1
            finally:
                container.close()
    except Exception as exc:
        return {
            "success": False,
            "error": {
                "code": "VIDEO_THUMBNAIL_FAILED",
                "message": str(exc),
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    if not candidates:
        return {
            "success": False,
            "error": {
                "code": "VIDEO_THUMBNAIL_FRAME_NOT_FOUND",
                "message": "No video frame was available for thumbnail extraction.",
            },
            "total_seconds": round(time.perf_counter() - started, 2),
        }

    accepted = [candidate for candidate in candidates if not candidate["stats"]["rejected"]]
    selected = accepted[0] if accepted else max(candidates, key=lambda item: item["stats"]["score"])
    image_data_url = encode_thumbnail_image(selected["image"])

    return {
        "success": True,
        "imageDataUrl": image_data_url,
        "mimeType": "image/jpeg",
        "timestamp": selected["timestamp"],
        "strategy": "first_good_candidate" if accepted else "best_available_candidate",
        "candidates": [
            {"timestamp": item["timestamp"], "stats": item["stats"]}
            for item in candidates
        ],
        "platform": detect_video_platform(url, info),
        "duration": duration or None,
        "total_seconds": round(time.perf_counter() - started, 2),
    }


def frange(start: float, stop: float, step: float) -> list[float]:
    values: list[float] = []
    current = start
    while current <= stop:
        values.append(current)
        current += step
    return values


def format_timestamp(seconds: Any) -> str:
    try:
        value = max(0, int(float(seconds or 0)))
    except Exception:
        value = 0
    minutes, second = divmod(value, 60)
    hours, minute = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minute:02d}:{second:02d}"
    return f"{minute:02d}:{second:02d}"


def extract_video_text(url: str, language: str | None = None, include_ocr: bool = True) -> dict[str, Any]:
    started = time.perf_counter()

    if not isinstance(url, str) or not is_allowed_video_url(url):
        raise TranscriptionError(400, "INVALID_URL", "Only direct http(s) video URLs are accepted.")

    language_hint = normalize_language_hint(language)

    try:
        info = get_video_info(url)
    except TranscriptionError:
        raise
    except Exception as exc:
        raise TranscriptionError(422, "METADATA_FAILED", "Could not read video metadata.") from exc

    transcript = ""
    transcript_source = "none"
    transcript_language: str | None = None
    caption_errors: list[dict[str, str]] = []

    for source, caption_language, caption in iter_caption_candidates(info, language_hint):
        try:
            transcript = fetch_caption_text(caption)
        except Exception as exc:
            caption_errors.append({
                "source": source,
                "language": caption_language,
                "message": str(exc),
            })
            continue
        if transcript:
            transcript_source = source
            transcript_language = caption_language
            break

    duration = float(info.get("duration") or 0)
    description = clean_platform_text(info.get("description") or "")
    platform = detect_video_platform(url, info)
    text_before_ocr = clean_platform_text("\n".join([description, transcript]))
    ocr_result: dict[str, Any] = {
        "success": False,
        "text": "",
        "events": [],
        "engine": "tesseract",
        "error": {
            "code": "OCR_SKIPPED_TEXT_AVAILABLE" if len(text_before_ocr) >= 300 else "OCR_SKIPPED_DISABLED",
            "message": "OCR was not needed." if len(text_before_ocr) >= 300 else "OCR was not requested.",
        },
    }
    if include_ocr and len(text_before_ocr) < 300:
        ocr_result = sample_video_ocr(url, info, language_hint or transcript_language or info.get("language"))

    return {
        "success": True,
        "platform": platform,
        "extractorKey": info.get("extractor_key") or info.get("ie_key"),
        "title": info.get("title") or "",
        "description": description,
        "thumbnail": info.get("thumbnail") or "",
        "transcript": transcript,
        "transcriptSource": transcript_source,
        "ocrText": ocr_result.get("text") or "",
        "ocr": ocr_result,
        "language": transcript_language or info.get("language") or info.get("original_language"),
        "duration": duration or None,
        "resolution": {
            "width": info.get("width"),
            "height": info.get("height"),
        },
        "captionDiagnostics": {
            "manualLanguages": sorted((info.get("subtitles") or {}).keys()),
            "automaticLanguages": sorted((info.get("automatic_captions") or {}).keys()),
            "errors": caption_errors[:5],
        },
        "total_seconds": round(time.perf_counter() - started, 2),
    }


def media_download_attempts_from_info(info: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not info:
        return []
    direct_attempts: list[dict[str, Any]] = []
    formats = [item for item in info.get("formats") or [] if isinstance(item, dict) and item.get("url")]
    best_format = pick_best_video_format(info)
    ordered_formats = []
    if best_format:
        ordered_formats.append(best_format)
    ordered_formats.extend(item for item in formats if item is not best_format)

    for index, item in enumerate(ordered_formats[:4]):
        media_url = item.get("url")
        if not isinstance(media_url, str) or not media_url:
            continue
        direct_attempts.append({
            "name": f"direct-media-{index + 1}",
            "url": media_url,
            "format": "bestaudio/best",
            "http_headers": info.get("http_headers") if isinstance(info.get("http_headers"), dict) else None,
        })
    return direct_attempts


def download_audio(url: str, temp_dir: Path, info: dict[str, Any] | None = None) -> Path:
    attempts: list[dict[str, Any]] = [
        {
            "name": "default-webm",
            "format": "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best",
        },
        {
            "name": "ios-m4a",
            "format": "bestaudio[ext=m4a]/bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["ios"]}},
        },
        {
            "name": "android-audio",
            "format": "bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["android"]}},
        },
        {
            "name": "web-audio",
            "format": "bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["web"]}},
        },
    ]
    attempts = media_download_attempts_from_info(info) + attempts
    errors: list[str] = []

    for attempt in attempts:
        options = {
            "format": attempt["format"],
            "outtmpl": str(temp_dir / f"{attempt['name']}-%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "retries": 2,
            "fragment_retries": 2,
            "logger": QuietYtdlpLogger(),
            "nocheckcertificate": settings.ytdlp_no_check_certificate,
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
            },
        }
        if attempt.get("http_headers"):
            options["http_headers"].update(attempt["http_headers"])
        ffmpeg_path = BUNDLED_FFMPEG_PATH or shutil.which("ffmpeg")
        if ffmpeg_path:
            options["ffmpeg_location"] = str(Path(ffmpeg_path).resolve().parent)
        if attempt.get("extractor_args"):
            options["extractor_args"] = attempt["extractor_args"]

        before = {item.resolve() for item in temp_dir.iterdir()}
        try:
            with YoutubeDL(options) as ydl:
                ydl.extract_info(attempt.get("url") or url, download=True)
        except Exception as exc:
            errors.append(f"{attempt['name']}: {exc}")
            continue

        after = [
            item
            for item in temp_dir.iterdir()
            if item.resolve() not in before and item.is_file() and item.stat().st_size > 0
        ]
        if after:
            return max(after, key=lambda item: item.stat().st_size)

        errors.append(f"{attempt['name']}: no audio file was created")

    combined_errors = " | ".join(errors[-4:])
    code = "DOWNLOAD_FORBIDDEN" if re.search(r"\b403\b|forbidden", combined_errors, re.I) else "DOWNLOAD_FAILED"
    raise TranscriptionError(422, code, f"Audio file was not downloaded. {combined_errors}")


def transcribe_audio(audio_path: Path, language_hint: str | None) -> tuple[str, str | None, float | None, float, float]:
    model = get_model()
    model_load_seconds = get_last_model_load_seconds()
    started = time.perf_counter()
    segments, info = model.transcribe(
        str(audio_path),
        language=language_hint,
        vad_filter=settings.vad_filter,
        beam_size=5,
        task="transcribe",
    )
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    elapsed = time.perf_counter() - started
    language = getattr(info, "language", None)
    language_probability = getattr(info, "language_probability", None)
    return text, language, language_probability, elapsed, model_load_seconds


def transcribe_video(url: str, language: str | None = None) -> dict[str, Any]:
    started = time.perf_counter()

    if not isinstance(url, str) or not is_allowed_video_url(url):
        raise TranscriptionError(400, "INVALID_URL", "Only direct http(s) video URLs are accepted.")

    language_hint = normalize_language_hint(language)

    metadata_started = time.perf_counter()
    try:
        info = get_video_info(url)
    except TranscriptionError:
        raise
    except Exception as exc:
        raise TranscriptionError(422, "METADATA_FAILED", "Could not read video metadata.") from exc
    metadata_seconds = time.perf_counter() - metadata_started

    duration = float(info.get("duration") or 0)
    max_duration_seconds = settings.max_video_duration_minutes * 60
    if duration and duration > max_duration_seconds:
        raise TranscriptionError(
            413,
            "VIDEO_TOO_LONG",
            f"Video is longer than the configured {settings.max_video_duration_minutes:g} minute limit.",
        )

    try:
        with tempfile.TemporaryDirectory(prefix="taste-trace-transcribe-") as temp_root:
            temp_dir = Path(temp_root)
            download_started = time.perf_counter()
            audio_path = download_audio(url, temp_dir, info)
            download_seconds = time.perf_counter() - download_started
            text, detected_language, language_probability, transcription_seconds, model_load_seconds = transcribe_audio(
                audio_path,
                language_hint,
            )
    except TranscriptionError:
        raise
    except Exception as exc:
        raise TranscriptionError(500, "TRANSCRIPTION_FAILED", "Video transcription failed.") from exc

    total_seconds = time.perf_counter() - started
    timings = {
        "metadata_seconds": round(metadata_seconds, 2),
        "download_seconds": round(download_seconds, 2),
        "model_load_seconds": round(model_load_seconds, 2),
        "transcription_seconds": round(transcription_seconds, 2),
        "total_seconds": round(total_seconds, 2),
    }

    return {
        "success": True,
        "text": text,
        "language": detected_language,
        "language_probability": language_probability,
        "duration": duration or None,
        "engine": ENGINE,
        "model": settings.whisper_model,
        "device": settings.whisper_device,
        "compute_type": settings.whisper_compute_type,
        "transcription_seconds": timings["transcription_seconds"],
        "total_seconds": timings["total_seconds"],
        "timings": timings,
    }


def get_local_media_duration(media_path: Path) -> float | None:
    try:
        import av

        with av.open(str(media_path)) as container:
            if container.duration:
                return float(container.duration / av.time_base)
            durations = [
                float(stream.duration * stream.time_base)
                for stream in container.streams
                if stream.duration is not None and stream.time_base is not None
            ]
            return max(durations) if durations else None
    except Exception:
        return None


def transcribe_file(file_path: str, language: str | None = None) -> dict[str, Any]:
    started = time.perf_counter()

    if not isinstance(file_path, str) or not file_path.strip():
        raise TranscriptionError(400, "INVALID_FILE", "Video file path is required.")

    media_path = Path(file_path).expanduser().resolve()
    if not media_path.exists() or not media_path.is_file():
        raise TranscriptionError(400, "INVALID_FILE", "Selected video file was not found.")

    language_hint = normalize_language_hint(language)

    metadata_started = time.perf_counter()
    duration = get_local_media_duration(media_path)
    metadata_seconds = time.perf_counter() - metadata_started

    max_duration_seconds = settings.max_video_duration_minutes * 60
    if duration and duration > max_duration_seconds:
        raise TranscriptionError(
            413,
            "VIDEO_TOO_LONG",
            f"Video is longer than the configured {settings.max_video_duration_minutes:g} minute limit.",
        )

    try:
        text, detected_language, language_probability, transcription_seconds, model_load_seconds = transcribe_audio(
            media_path,
            language_hint,
        )
    except TranscriptionError:
        raise
    except Exception as exc:
        raise TranscriptionError(500, "TRANSCRIPTION_FAILED", "Video transcription failed.") from exc

    total_seconds = time.perf_counter() - started
    timings = {
        "metadata_seconds": round(metadata_seconds, 2),
        "download_seconds": 0,
        "model_load_seconds": round(model_load_seconds, 2),
        "transcription_seconds": round(transcription_seconds, 2),
        "total_seconds": round(total_seconds, 2),
    }

    return {
        "success": True,
        "text": text,
        "language": detected_language,
        "language_probability": language_probability,
        "duration": duration,
        "engine": ENGINE,
        "model": settings.whisper_model,
        "device": settings.whisper_device,
        "compute_type": settings.whisper_compute_type,
        "transcription_seconds": timings["transcription_seconds"],
        "total_seconds": timings["total_seconds"],
        "timings": timings,
        "source": {
            "type": "local_file",
            "fileName": media_path.name,
        },
    }


def transcribe_youtube(url: str, language: str | None = None) -> dict[str, Any]:
    return transcribe_video(url, language)


def health_payload() -> dict[str, Any]:
    ffmpeg_path = BUNDLED_FFMPEG_PATH or shutil.which("ffmpeg")
    return {
        "status": "ok",
        "engine": ENGINE,
        "model": settings.whisper_model,
        "model_dir": settings.whisper_model_dir,
        "device": settings.whisper_device,
        "compute_type": settings.whisper_compute_type,
        "default_language": settings.whisper_language or "auto",
        "vad_filter": settings.vad_filter,
        "token_configured": bool(settings.api_token),
        "ffmpeg_found": ffmpeg_path is not None,
        "ffmpeg_path": ffmpeg_path,
        "ytdlp_no_check_certificate": settings.ytdlp_no_check_certificate,
        "python_system_certs": SYSTEM_CERTS_ENABLED,
    }
