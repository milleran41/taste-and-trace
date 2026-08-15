$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonCandidates = @(
  (Join-Path $serviceRoot ".venv313\Scripts\python.exe"),
  (Join-Path $serviceRoot ".venv\Scripts\python.exe")
)
$python = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$spec = Join-Path $serviceRoot "transcription-helper.spec"

if (-not $python) {
  $systemPython = (Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if (-not $systemPython) {
    throw "Python was not found and no local virtual environment exists. Checked: $($pythonCandidates -join ', ')"
  }

  $venv = Join-Path $serviceRoot ".venv313"
  & $systemPython -m venv $venv
  $python = Join-Path $venv "Scripts\python.exe"
  & $python -m pip install --upgrade pip
  & $python -m pip install -r (Join-Path $serviceRoot "requirements.txt") -r (Join-Path $serviceRoot "requirements-build.txt")
}

Push-Location $serviceRoot
try {
  & $python -m PyInstaller --clean --noconfirm $spec
} finally {
  Pop-Location
}
