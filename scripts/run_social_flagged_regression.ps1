[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $root "rides-api")
try {
  Write-Host "==> Running social flagged-content regression tests"
  npm run test:regression:social:flagged
  if ($LASTEXITCODE -ne 0) {
    throw "Social flagged-content regression failed with exit code $LASTEXITCODE"
  }
  Write-Host "PASS: social flagged-content regression" -ForegroundColor Green
} finally {
  Pop-Location
}
