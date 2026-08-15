from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from transcriber import (
    APP_NAME,
    TranscriptionError,
    error_payload,
    health_payload,
    settings,
    transcribe_video,
)


class TranscribeRequest(BaseModel):
    url: str
    language: str | None = None


app = FastAPI(title=APP_NAME)


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_payload(code, message))


def authorize(request: Request) -> JSONResponse | None:
    if not settings.api_token:
        return error_response(
            503,
            "TOKEN_NOT_CONFIGURED",
            "TRANSCRIPTION_API_TOKEN is not configured on the transcription service.",
        )

    header = request.headers.get("authorization", "")
    expected = f"Bearer {settings.api_token}"
    if header != expected:
        return error_response(401, "UNAUTHORIZED", "Missing or invalid bearer token.")

    return None


@app.get("/health")
def health() -> dict[str, Any]:
    return health_payload()


@app.post("/transcribe")
def transcribe(payload: TranscribeRequest, request: Request) -> JSONResponse:
    auth_error = authorize(request)
    if auth_error:
        return auth_error

    try:
        return JSONResponse(content=transcribe_video(payload.url, payload.language))
    except TranscriptionError as exc:
        return error_response(exc.status_code, exc.code, exc.message)
    except Exception:
        return error_response(500, "TRANSCRIPTION_FAILED", "Video transcription failed.")
