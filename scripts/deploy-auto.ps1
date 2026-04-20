[CmdletBinding()]
param(
  [switch]$PrintCompose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$composeGpu = 'docker-compose.production.yml'
$composeCpu = 'docker-compose.production.cpu.yml'
$minAvailableMB = if ($env:MIN_AVAILABLE_MB) { [int]$env:MIN_AVAILABLE_MB } else { 512 }
$fastMinAvailableMB = if ($env:FAST_MIN_AVAILABLE_MB) { [int]$env:FAST_MIN_AVAILABLE_MB } else { 1024 }

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  Write-Host "[deploy-auto] $Label"
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Get-PagefileFreeMB {
  try {
    $pagefiles = Get-CimInstance Win32_PageFileUsage -ErrorAction Stop
    if (-not $pagefiles) { return 0 }
    $free = 0
    foreach ($pf in $pagefiles) {
      $allocated = [double]($pf.AllocatedBaseSize)
      $used = [double]($pf.CurrentUsage)
      $free += [Math]::Max(0, ($allocated - $used))
    }
    return [int][Math]::Round($free)
  } catch {
    return 0
  }
}

function Resource-Guard {
  param([Parameter(Mandatory = $true)][int]$MinRequiredMB)

  if ($env:LOW_MEM_OK -eq '1') {
    Write-Host '[deploy-auto] LOW_MEM_OK=1 -> skipping resource guard'
    return
  }

  try {
    $memCounter = Get-Counter '\Memory\Available MBytes' -ErrorAction Stop
    $memAvailMB = [int][Math]::Round($memCounter.CounterSamples[0].CookedValue)
  } catch {
    $os = Get-CimInstance Win32_OperatingSystem
    $memAvailMB = [int][Math]::Round(([double]$os.FreePhysicalMemory) / 1024)
  }
  $swapFreeMB = Get-PagefileFreeMB
  $totalAvailMB = $memAvailMB + $swapFreeMB

  Write-Host "[deploy-auto] resources: mem_available=${memAvailMB}MB swap_free=${swapFreeMB}MB total=${totalAvailMB}MB"
  if ($totalAvailMB -lt $MinRequiredMB) {
    throw "available memory+swap (${totalAvailMB}MB) is below required threshold (${MinRequiredMB}MB). Set LOW_MEM_OK=1 to bypass."
  }
}

# build metadata
$env:BUILD_DATE = (Get-Date).ToString('yyyy-MM-dd')
$gitSha = 'unknown'
try {
  $gitSha = (git rev-parse --short HEAD 2>$null).Trim()
  if (-not $gitSha) { $gitSha = 'unknown' }
} catch {
  $gitSha = 'unknown'
}
$env:GIT_SHA = $gitSha

$hasGpu = $false
try {
  $hasNvidiaSmi = [bool](Get-Command nvidia-smi -ErrorAction SilentlyContinue)
  if ($hasNvidiaSmi) {
    & nvidia-smi -L *> $null
    if ($LASTEXITCODE -eq 0) {
      $runtimes = docker info --format '{{json .Runtimes}}' 2>$null
      if ($LASTEXITCODE -eq 0 -and $runtimes -match '"nvidia"') {
        $hasGpu = $true
      }
    }
  }
} catch {
  $hasGpu = $false
}

if ($env:FORCE_CPU -eq '1') { $hasGpu = $false }
if ($env:FORCE_GPU -eq '1') { $hasGpu = $true }

$composeFile = if ($hasGpu) { $composeGpu } else { $composeCpu }
$mode = if ($hasGpu) { 'GPU' } else { 'CPU' }

if ($PrintCompose) {
  Write-Output $composeFile
  exit 0
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker CLI not found in PATH. Install/start Docker Desktop (or Docker Engine) and retry."
}

Set-Content -Path '.deploy-compose' -Value $composeFile -NoNewline

Write-Host "[deploy-auto] mode=${mode} compose=${composeFile}"
Write-Host "[deploy-auto] build metadata: BUILD_DATE=$($env:BUILD_DATE) GIT_SHA=$($env:GIT_SHA)"

$fastDeploy = ($env:FAST_DEPLOY -eq '1')
if (-not $fastDeploy) {
  Write-Host '[deploy-auto] SAFE mode (default) -> sequential build + rolling up'
  $env:COMPOSE_PARALLEL_LIMIT = '1'
  Resource-Guard -MinRequiredMB $minAvailableMB
  $services = @('rides-api', 'ml-service', 'rides-admin', 'rides-app-web')
  foreach ($svc in $services) {
    Resource-Guard -MinRequiredMB $minAvailableMB
    Invoke-Checked -Label "building $svc" -Action { docker compose -f $composeFile build $svc }
    Invoke-Checked -Label "restarting $svc" -Action { docker compose -f $composeFile up -d --no-deps $svc }
  }
  Invoke-Checked -Label 'bringing all services up' -Action { docker compose -f $composeFile up -d --remove-orphans }
} else {
  Write-Host '[deploy-auto] FAST_DEPLOY=1 -> parallel build/up'
  Resource-Guard -MinRequiredMB $fastMinAvailableMB
  Invoke-Checked -Label 'parallel compose up' -Action { docker compose -f $composeFile up -d --build --remove-orphans }
}

Invoke-Checked -Label 'compose ps' -Action { docker compose -f $composeFile ps }

if ($env:SKIP_SMOKE -eq '1') {
  Write-Host '[deploy-auto] SKIP_SMOKE=1 -> skipping smoke checks'
} else {
  Write-Host '[deploy-auto] running post-deploy smoke checks...'
  $env:COMPOSE_FILE = $composeFile
  & (Join-Path $PSScriptRoot 'aws-smoke-check.ps1')
}
