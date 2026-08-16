import json
import sys
import traceback
from typing import Any

from transcriber import (
    TranscriptionError,
    error_payload,
    extract_video_text,
    extract_video_thumbnail,
    health_payload,
    transcribe_file,
    transcribe_video,
    transcribe_youtube,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def write_stdout(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> int:
    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input or "{}")
    except Exception:
        write_stdout(error_payload("INVALID_REQUEST", "Request body must be valid JSON."))
        return 1

    if not isinstance(payload, dict):
        write_stdout(error_payload("INVALID_REQUEST", "Request body must be a JSON object."))
        return 1

    try:
        mode = payload.get("mode")
        if mode == "health":
            result = health_payload()
        elif mode == "extract-video-text":
            result = extract_video_text(
                payload.get("url"),
                payload.get("language"),
                payload.get("includeOcr", True) is not False,
            )
        elif mode == "extract-video-thumbnail":
            result = extract_video_thumbnail(payload.get("url"))
        elif mode == "transcribe-file":
            result = transcribe_file(payload.get("path"), payload.get("language"))
        elif mode == "transcribe-video":
            result = transcribe_video(payload.get("url"), payload.get("language"))
        else:
            result = transcribe_youtube(payload.get("url"), payload.get("language"))
        write_stdout(result)
        return 0
    except TranscriptionError as exc:
        print(f"[transcription-cli] {exc.code}: {exc.message}", file=sys.stderr)
        write_stdout(error_payload(exc.code, exc.message))
        return 1
    except Exception:
        traceback.print_exc(file=sys.stderr)
        write_stdout(error_payload("TRANSCRIPTION_FAILED", "Video transcription failed."))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
