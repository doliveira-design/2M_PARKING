# ============================================
# 2M Parking — Deploy Script (PowerShell)
# Uso: .\scripts\deploy.ps1 [-BackupFirst]
# ============================================
param(
    [switch]$BackupFirst,
    [string]$DeployDir = "C:\inetpub\2mparking"
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

Write-Host "`n=== 2M Parking — Deploy ===" -ForegroundColor Cyan
Write-Host "[INFO] Origem:  $ROOT"
Write-Host "[INFO] Destino: $DeployDir"

# --- Pré-verificações ---
$distPath = Join-Path $ROOT "dist\valetv2"
if (-not (Test-Path (Join-Path $distPath "index.html"))) {
    Write-Host "[ERRO] Frontend nao buildado. Execute build.ps1 primeiro." -ForegroundColor Red
    exit 1
}

$backendDir = Join-Path $ROOT "functions"
if (-not (Test-Path (Join-Path $backendDir "index.js"))) {
    Write-Host "[ERRO] index.js do backend nao encontrado." -ForegroundColor Red
    exit 1
}

# --- Backup do DB (opcional) ---
if ($BackupFirst) {
    Write-Host "`n--- Backup pre-deploy ---" -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "backup-db.ps1")
}

# --- Migração do banco ---
Write-Host "`n--- Migracao ---" -ForegroundColor Yellow
& "C:\Program Files\nodejs\node.exe" (Join-Path $PSScriptRoot "migrate-all.js")
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Migracao falhou. Deploy abortado." -ForegroundColor Red
    exit 1
}

# --- Parar PM2 ---
Write-Host "`n--- Parando servico ---" -ForegroundColor Yellow
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    & pm2 stop 2m-parking-api 2>&1 | Out-Null
    Write-Host "[INFO] PM2: servico parado"
} else {
    Write-Host "[WARN] PM2 nao encontrado. Instale com: npm install -g pm2" -ForegroundColor Yellow
}

# --- Criar diretório de deploy ---
if (-not (Test-Path $DeployDir)) {
    New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null
}

# --- Copiar backend ---
Write-Host "`n--- Copiando backend ---" -ForegroundColor Yellow
$apiDir = Join-Path $DeployDir "api"
if (-not (Test-Path $apiDir)) { New-Item -ItemType Directory -Path $apiDir -Force | Out-Null }

$backendFiles = @("index.js", "package.json", "package-lock.json", "ecosystem.config.js", ".env")
foreach ($f in $backendFiles) {
    $src = Join-Path $backendDir $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $apiDir $f) -Force
    }
}
# node_modules
if (Test-Path (Join-Path $backendDir "node_modules")) {
    if (-not (Test-Path (Join-Path $apiDir "node_modules"))) {
        Write-Host "[INFO] Copiando node_modules..."
        Copy-Item (Join-Path $backendDir "node_modules") (Join-Path $apiDir "node_modules") -Recurse -Force
    }
}
# logs dir
$logsDir = Join-Path $apiDir "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

Write-Host "[OK] Backend copiado" -ForegroundColor Green

# --- Copiar frontend ---
Write-Host "`n--- Copiando frontend ---" -ForegroundColor Yellow
$wwwDir = Join-Path $DeployDir "www"
if (Test-Path $wwwDir) { Remove-Item $wwwDir -Recurse -Force }
Copy-Item $distPath $wwwDir -Recurse -Force

# Copiar web.config para o www (SPA routing)
$webConfig = Join-Path $ROOT "web.config"
if (Test-Path $webConfig) {
    Copy-Item $webConfig (Join-Path $wwwDir "web.config") -Force
}
Write-Host "[OK] Frontend copiado" -ForegroundColor Green

# --- Iniciar PM2 ---
Write-Host "`n--- Iniciando servico ---" -ForegroundColor Yellow
if ($pm2) {
    Push-Location $apiDir
    & pm2 start ecosystem.config.js --env production
    & pm2 save
    Pop-Location
    Write-Host "[OK] PM2: servico iniciado" -ForegroundColor Green
} else {
    Write-Host "[WARN] Inicie manualmente: cd $apiDir && pm2 start ecosystem.config.js --env production" -ForegroundColor Yellow
}

# --- Verificação ---
Write-Host "`n--- Verificacao ---" -ForegroundColor Yellow
Start-Sleep -Seconds 3
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5
    Write-Host "[OK] Backend respondendo — v$($resp.version), DB: $($resp.db)" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Backend nao respondeu no /health. Verifique os logs." -ForegroundColor Yellow
}

Write-Host "`n=== Deploy concluido ===" -ForegroundColor Cyan
