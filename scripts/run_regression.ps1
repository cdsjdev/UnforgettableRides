[CmdletBinding()]
param(
  [switch]$Full,
  [switch]$Mobile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stageResults = [ordered]@{}

function Stop-NodeOnPort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )
  try {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
  } catch {
    return
  }
  $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      if ($proc.ProcessName -ieq 'node') {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host "Stopped node PID $procId on port $Port"
      }
    } catch {
      # ignore processes that already exited
    }
  }
}

function Assert-LastExitCode {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Context
  )
  if ($LASTEXITCODE -ne 0) {
    throw "$Context failed with exit code $LASTEXITCODE"
  }
}

function Wait-HttpReady {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [int]$TimeoutSec = 90
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 5
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        return
      }
    } catch {
      # keep polling
    }
    Start-Sleep -Milliseconds 800
  }
  throw "Timeout waiting for $Url to become ready"
}

function Invoke-Stage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )
  Write-Host "==> $Name"
  $global:LASTEXITCODE = 0
  try {
    & $Action
    $stageResults[$Name] = 'PASS'
    Write-Host "PASS: $Name" -ForegroundColor Green
  } catch {
    $stageResults[$Name] = "FAIL: $($_.Exception.Message)"
    Write-Host "FAIL: $Name" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
  }
}

Invoke-Stage -Name 'API tests' -Action {
  Push-Location (Join-Path $root "rides-api")
  try {
    npm test
    Assert-LastExitCode -Context 'API tests'
  } finally {
    Pop-Location
  }
}

Invoke-Stage -Name 'API social flagged regression' -Action {
  Push-Location (Join-Path $root "rides-api")
  try {
    npm run test:regression:social:flagged
    Assert-LastExitCode -Context 'API social flagged regression'
  } finally {
    Pop-Location
  }
}

Invoke-Stage -Name 'API guest-public regression' -Action {
  Push-Location (Join-Path $root "rides-api")
  try {
    npm run test:regression:guest-public
    Assert-LastExitCode -Context 'API guest-public regression'
  } finally {
    Pop-Location
  }
}

Invoke-Stage -Name 'Web E2E install' -Action {
  Push-Location (Join-Path $root "rides-admin")
  try {
    Write-Host "==> Cleaning test ports (3000/5173) for isolated web E2E"
    Stop-NodeOnPort -Port 3000
    Stop-NodeOnPort -Port 5173

    if ($Full) {
      Write-Host "==> Installing Playwright browsers (Chromium + Firefox + WebKit)"
      npm run test:e2e:install:full
      Assert-LastExitCode -Context 'Web E2E install full'
    } else {
      Write-Host "==> Installing Playwright browser (Chromium)"
      npm run test:e2e:install
      Assert-LastExitCode -Context 'Web E2E install'
    }
  } finally {
    Pop-Location
  }
}

Invoke-Stage -Name 'Web E2E tests' -Action {
  Push-Location (Join-Path $root "rides-admin")
  try {
    if ($Full) {
      Write-Host "==> Running Web E2E regression tests (full matrix)"
      npm run test:e2e:full
      Assert-LastExitCode -Context 'Web E2E full'
      if ($Mobile) {
        Write-Host "==> Running Web E2E regression tests (mobile-chrome)"
        npm run test:e2e:mobile
        Assert-LastExitCode -Context 'Web E2E mobile'
      }
    } else {
      Write-Host "==> Running Web E2E regression tests (smoke)"
      npm run test:e2e
      Assert-LastExitCode -Context 'Web E2E smoke'
    }
  } finally {
    Pop-Location
  }
}

Invoke-Stage -Name 'App Web E2E tests' -Action {
  Push-Location (Join-Path $root "rides-app")
  $apiProc = $null
  $webProc = $null
  $apiLog = Join-Path $env:TEMP 'rides-app-e2e-api.log'
  $apiErrLog = Join-Path $env:TEMP 'rides-app-e2e-api.err.log'
  $webLog = Join-Path $env:TEMP 'rides-app-e2e-web.log'
  $webErrLog = Join-Path $env:TEMP 'rides-app-e2e-web.err.log'
  try {
    Write-Host "==> Cleaning app test ports (3100/19006) before app E2E"
    Stop-NodeOnPort -Port 3100
    Stop-NodeOnPort -Port 19006

    Write-Host "==> Starting app E2E API server (manual mode)"
    if (Test-Path $apiLog) { Remove-Item -Force $apiLog }
    if (Test-Path $apiErrLog) { Remove-Item -Force $apiErrLog }
    if (Test-Path $webLog) { Remove-Item -Force $webLog }
    if (Test-Path $webErrLog) { Remove-Item -Force $webErrLog }
    $apiCommand = @(
      '$env:NODE_ENV=''test'';'
      '$env:PORT=''3100'';'
      '$env:AUTH_DEVICE_CHALLENGE_ENABLED=''false'';'
      '$env:AUTH_REQUIRE_VERIFIED_FOR_SENSITIVE=''false'';'
      '$env:RATE_LIMIT_MAX_LOGIN=''10000'';'
      '$env:RATE_LIMIT_MAX_SIGNUP=''10000'';'
      '$env:RATE_LIMIT_WINDOW_MS=''60000'';'
      '$env:ANALYTICS_DB_PATH=''../rides-api/tests/data/analytics.app.e2e.db'';'
      'Set-Location ''' + (Join-Path $root "rides-app") + ''';'
      'node ./e2e/start-api.cjs'
    ) -join ' '
    $apiProc = Start-Process -FilePath 'powershell' -ArgumentList @('-NoProfile', '-Command', $apiCommand) -PassThru -WindowStyle Hidden -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrLog
    Wait-HttpReady -Url 'http://127.0.0.1:3100/api/v1/products' -TimeoutSec 90

    Write-Host "==> Starting Expo web server (manual mode)"
    $webCommand = @(
      '$env:EXPO_PUBLIC_API_URL=''http://127.0.0.1:3100/api/v1'';'
      '$env:CI=''1'';'
      'Set-Location ''' + (Join-Path $root "rides-app") + ''';'
      'npm run web:e2e'
    ) -join ' '
    $webProc = Start-Process -FilePath 'powershell' -ArgumentList @('-NoProfile', '-Command', $webCommand) -PassThru -WindowStyle Hidden -RedirectStandardOutput $webLog -RedirectStandardError $webErrLog
    Wait-HttpReady -Url 'http://127.0.0.1:19006' -TimeoutSec 120

    npm run check:encoding
    Assert-LastExitCode -Context 'App i18n encoding guard'
    npm run check:navigation-regression
    Assert-LastExitCode -Context 'App navigation regression guard'
    npm run e2e:guest:no-webserver
    Assert-LastExitCode -Context 'App guest-mode E2E regression'
    npm run e2e:no-webserver
    Assert-LastExitCode -Context 'App Web E2E tests'
  } finally {
    if ($webProc -and -not $webProc.HasExited) {
      Stop-Process -Id $webProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($apiProc -and -not $apiProc.HasExited) {
      Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-NodeOnPort -Port 19006
    Stop-NodeOnPort -Port 3100
    Pop-Location
  }
}

Write-Host ""
Write-Host "==> Regression Summary"
$failed = @()
foreach ($kv in $stageResults.GetEnumerator()) {
  $name = $kv.Key
  $status = [string]$kv.Value
  if ($status -eq 'PASS') {
    Write-Host "  [PASS] $name" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] $name :: $status" -ForegroundColor Red
    $failed += $name
  }
}

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "Regression suite finished with failures." -ForegroundColor Red
  exit 1
}

Write-Host ""
if ($Full) {
  Write-Host "Full regression suite passed" -ForegroundColor Green
} else {
  Write-Host "Smoke regression suite passed" -ForegroundColor Green
}
