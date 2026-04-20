[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker CLI not found in PATH. Install/start Docker Desktop (or Docker Engine) and retry."
}

$hostName = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }
$dashboardUrl = if ($env:DASHBOARD_URL) { $env:DASHBOARD_URL } else { "http://${hostName}:8080" }
$apiBase = if ($env:API_BASE) { $env:API_BASE } else { "${dashboardUrl}/api/v1" }
$portalUrl = if ($env:PORTAL_URL) { $env:PORTAL_URL } else { "http://${hostName}:8082" }
$appWebUrl = if ($env:APP_WEB_URL) { $env:APP_WEB_URL } else { "http://${hostName}:8081" }

if ($env:COMPOSE_FILE) {
  $composeFilePath = $env:COMPOSE_FILE
} elseif (Test-Path '.deploy-compose') {
  $composeFilePath = (Get-Content '.deploy-compose' -Raw).Trim()
} else {
  $composeFilePath = 'docker-compose.production.cpu.yml'
}

if (-not (Test-Path $composeFilePath)) {
  throw "compose file not found: $composeFilePath"
}

Write-Host "==> Smoke check using compose file: $composeFilePath"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  Write-Host "-> $Label"
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Assert-ServiceRunning {
  param([Parameter(Mandatory = $true)][string]$Service)
  $output = docker compose -f $composeFilePath ps $Service 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "service $Service status check failed"
  }
  if ($output -notmatch '(?im)\b(Up|running)\b') {
    throw "service $Service is not running"
  }
}

function Assert-HttpOk {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [switch]$Head
  )
  $method = if ($Head) { 'Head' } else { 'Get' }
  $resp = Invoke-WebRequest -Uri $Url -Method $method -UseBasicParsing -TimeoutSec 15
  if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 400) {
    throw "HTTP check failed for $Url (status $($resp.StatusCode))"
  }
}

Invoke-Checked -Label 'containers running' -Action { docker compose -f $composeFilePath ps }
foreach ($svc in @('rides-api', 'rides-admin', 'rides-portal', 'rides-app-web', 'ml-service')) {
  Invoke-Checked -Label "service $svc status" -Action { Assert-ServiceRunning -Service $svc }
}

Invoke-Checked -Label 'API health' -Action { Assert-HttpOk -Url "$apiBase/health" }
Invoke-Checked -Label 'dashboard home responds' -Action { Assert-HttpOk -Url $dashboardUrl -Head }
Invoke-Checked -Label 'portal home responds' -Action { Assert-HttpOk -Url $portalUrl -Head }
Invoke-Checked -Label 'app web responds' -Action { Assert-HttpOk -Url $appWebUrl -Head }

Write-Host '==> Smoke check passed'
