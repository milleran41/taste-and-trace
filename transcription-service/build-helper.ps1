$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonCandidates = @(
  (Join-Path $serviceRoot ".venv-build\Scripts\python.exe"),
  (Join-Path $serviceRoot ".venv313\Scripts\python.exe"),
  (Join-Path $serviceRoot ".venv\Scripts\python.exe")
)
$spec = Join-Path $serviceRoot "transcription-helper.spec"
$venv = Join-Path $serviceRoot ".venv-build"

function Test-PythonExecutable {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    return $false
  }
  try {
    & $Path --version *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-SystemPython {
  $explicit = $env:TASTE_TRACE_PYTHON
  if (Test-PythonExecutable $explicit) {
    return $explicit
  }

  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pythonCommand -and (Test-PythonExecutable $pythonCommand.Source)) {
    return $pythonCommand.Source
  }

  $pyCommand = Get-Command py -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pyCommand) {
    return $pyCommand.Source
  }

  return $null
}

$python = $pythonCandidates | Where-Object { Test-PythonExecutable $_ } | Select-Object -First 1

if (-not $python) {
  $systemPython = Get-SystemPython
  if (-not $systemPython) {
    throw "Python was not found and no working local virtual environment exists. Checked: $($pythonCandidates -join ', ')"
  }

  if ((Split-Path -Leaf $systemPython) -ieq "py.exe") {
    & $systemPython -3.13 -m venv --clear $venv
    if ($LASTEXITCODE -ne 0) {
      & $systemPython -3 -m venv --clear $venv
    }
  } else {
    & $systemPython -m venv --clear $venv
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create Python virtual environment at $venv"
  }

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
