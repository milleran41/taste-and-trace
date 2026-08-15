# Taste & Trace Transcription Service

Local/self-hosted service for one job:

```text
YouTube URL -> audio-only download -> automatic language detection -> faster-whisper speech recognition -> original-language plain text
```

It does not use Supabase, Gemini, React, paid speech APIs, or the recipe parser.

## Requirements

- Windows 10/11
- Python 3.11 or 3.12. This project was checked with Python 3.12.8.
- Internet access for `yt-dlp` and for the first Whisper model download.
- Optional but recommended: `ffmpeg`.

The service asks `yt-dlp` for an audio-only stream and does not intentionally download the full video. Temporary audio files are created in the system temp directory and deleted after each request.

## Install on Windows

Open PowerShell in this folder:

```powershell
cd "C:\Users\Hyrican\Desktop\Кулинарная книга\taste-and-trace-main\transcription-service"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Check `ffmpeg`:

```powershell
ffmpeg -version
```

If Windows says `ffmpeg` is not recognized, the first prototype can still work because `faster-whisper`/PyAV can decode many downloaded audio formats. Install `ffmpeg` later if YouTube audio extraction or decoding fails for some videos.

## Configure

Create `.env` from the example:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```env
TRANSCRIPTION_API_TOKEN=replace-with-a-long-random-token
WHISPER_MODEL=small
WHISPER_COMPUTE_TYPE=int8
WHISPER_DEVICE=cpu
WHISPER_LANGUAGE=
WHISPER_VAD_FILTER=true
MAX_VIDEO_DURATION_MINUTES=30
PYTHON_USE_SYSTEM_CERTS=true
YTDLP_NO_CHECK_CERTIFICATE=false
```

Notes:

- `WHISPER_MODEL=small` is the first CPU-friendly multilingual choice.
- Try `medium` later if quality is more important than speed.
- Keep `WHISPER_LANGUAGE=` empty to use automatic language detection by default.
- Set `WHISPER_LANGUAGE=de`, `ru`, `uk`, etc. only for diagnostics or a dedicated deployment.
- The service uses Whisper's `transcribe` task. It does not translate the transcript.
- Keep `PYTHON_USE_SYSTEM_CERTS=true` on Windows so Python can use the Windows certificate store for HuggingFace model downloads.
- Keep `YTDLP_NO_CHECK_CERTIFICATE=false`. Set it to `true` only if your local Windows/Python certificate store blocks YouTube with `CERTIFICATE_VERIFY_FAILED`.

## Run

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 127.0.0.1 --port 8765
```

The first real transcription may download the Whisper model and take longer.

## Health Check

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

Example:

```json
{
  "status": "ok",
  "engine": "faster-whisper",
  "model": "small",
  "device": "cpu",
  "compute_type": "int8",
  "default_language": "auto",
  "vad_filter": true,
  "token_configured": true,
  "ffmpeg_found": false,
  "ytdlp_no_check_certificate": false,
  "python_system_certs": true
}
```

## Transcribe

```powershell
$headers = @{ Authorization = "Bearer replace-with-a-long-random-token" }
$body = @{ url = "https://www.youtube.com/watch?v=VIDEO_ID" } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8765/transcribe -Method Post -Headers $headers -ContentType "application/json" -Body $body
```

Optional language hint:

```powershell
$body = @{
  url = "https://www.youtube.com/watch?v=VIDEO_ID"
  language = "de"
} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8765/transcribe -Method Post -Headers $headers -ContentType "application/json" -Body $body
```

Success response:

```json
{
  "success": true,
  "text": "...",
  "language": "de",
  "language_probability": 0.97,
  "duration": 123.4,
  "engine": "faster-whisper",
  "model": "small",
  "device": "cpu",
  "compute_type": "int8",
  "transcription_seconds": 42.1,
  "total_seconds": 48.3
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Only direct YouTube video URLs are accepted."
  }
}
```

## Current Limits

- Only direct YouTube video URLs are accepted.
- Playlists, local file paths, Instagram, TikTok, VK, and arbitrary URLs are rejected.
- Videos longer than `MAX_VIDEO_DURATION_MINUTES` are rejected before download.
- The transcript is returned in the original spoken language. Mixed-language ingredient or dish names are left as recognized by Whisper.
- There is no queue, database, Docker, Supabase integration, Gemini integration, or UI yet.
