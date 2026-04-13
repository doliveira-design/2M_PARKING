# ============================================
# 2M Parking — Build Script (PowerShell)
# Uso: .\scripts\build.ps1
# ============================================
param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
# ROOT = valetv2/

Write-Host "`n=== 2M Parking — Build ===" -ForegroundColor Cyan

# --- Pré-requisitos ---
$NODE = "C:\Program Files\nodejs\node.exe"
$NPM  = "C:\Program Files\nodejs\npm.cmd"
$NPX  = "C:\Program Files\nodejs\npx.cmd"
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

if (-not (Test-Path $NODE)) {
    Write-Host "[ERRO] Node.js nao encontrado em $NODE" -ForegroundColor Red
    exit 1
}
Write-Host "[INFO] Node.js: $(& $NODE --version)"

# --- Backend ---
if (-not $SkipBackend) {
    Write-Host "`n--- Backend ---" -ForegroundColor Yellow
    $backendDir = Join-Path $ROOT "functions"

    if (-not (Test-Path (Join-Path $backendDir "node_modules"))) {
        Write-Host "[INFO] Instalando dependencias do backend..."
        Push-Location $backendDir
        & $NPM install --production 2>&1 | Out-Null
        Pop-Location
    }
    Write-Host "[OK] Backend pronto (sem build necessario)" -ForegroundColor Green
}

# --- Frontend ---
if (-not $SkipFrontend) {
    Write-Host "`n--- Frontend ---" -ForegroundColor Yellow
    Push-Location $ROOT

    if (-not (Test-Path "node_modules")) {
        Write-Host "[INFO] Instalando dependencias do frontend..."
        & $NPM install --legacy-peer-deps 2>&1 | Select-Object -Last 5
    }

    Write-Host "[INFO] Building Angular (production)..."
    $env:NODE_OPTIONS = "--openssl-legacy-provider"
    & $NPX ng build --prod 2>&1 | Select-Object -Last 10

    $distPath = Join-Path $ROOT "dist\valetv2"
    if (Test-Path (Join-Path $distPath "index.html")) {
        $fileCount = (Get-ChildItem $distPath -Recurse -File).Count
        $totalSize = [math]::Round(((Get-ChildItem $distPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 2)
        Write-Host "[OK] Build completo: $fileCount arquivos, ${totalSize}MB" -ForegroundColor Green
    } else {
        Write-Host "[ERRO] Build falhou — dist/valetv2/index.html nao encontrado" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
}

Write-Host "`n=== Build concluido ===" -ForegroundColor Cyan
