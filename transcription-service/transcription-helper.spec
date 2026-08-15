# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_dynamic_libs, collect_submodules


datas = []
binaries = []
ffmpeg_path = Path("vendor/ffmpeg/bin/ffmpeg.exe")
if ffmpeg_path.exists():
    binaries.append((str(ffmpeg_path), "ffmpeg"))
hiddenimports = [
    "truststore",
    "yt_dlp",
    *collect_submodules("faster_whisper"),
    *collect_submodules("ctranslate2"),
    *collect_submodules("av"),
    *collect_submodules("PIL"),
]

for package_name in ("faster_whisper", "ctranslate2", "av", "PIL", "huggingface_hub", "tokenizers"):
    package_datas, package_binaries, package_hiddenimports = collect_all(package_name)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports

binaries += collect_dynamic_libs("ctranslate2")
binaries += collect_dynamic_libs("av")

a = Analysis(
    ["cli.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "fastapi",
        "uvicorn",
        "pytest",
        "IPython",
        "notebook",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="transcription-helper",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="transcription-helper",
)
