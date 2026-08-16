$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonCandidates = @(
  (Join-Path $serviceRoot ".venv313\Scripts\python.exe"),
  (Join-Path $serviceRoot ".venv\Scripts\python.exe")
)
$python = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$spec = Join-Path $serviceRoot "transcription-helper.spec"

if (-not $python) {
  throw "Python virtual environment was not found. Checked: $($pythonCandidates -join ', ')"
}

Push-Location $serviceRoot
try {
  & $python -m PyInstaller --clean --noconfirm $spec
} finally {
  Pop-Location
}
