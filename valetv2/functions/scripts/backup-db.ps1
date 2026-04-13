# ============================================
# 2M Parking — Backup SQL Server (PowerShell)
# Uso: .\scripts\backup-db.ps1 [-RetainDays 7]
# ============================================
param(
    [int]$RetainDays = 7,
    [string]$BackupDir = "C:\Backups\MParking"
)

$ErrorActionPreference = "Stop"
$DB_NAME = "MParking"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "${DB_NAME}_${timestamp}.bak"

Write-Host "`n=== 2M Parking — Backup ===" -ForegroundColor Cyan

# --- Criar diretório ---
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Host "[INFO] Diretorio criado: $BackupDir"
}

$fullPath = Join-Path $BackupDir $backupFile

# --- Executar backup via sqlcmd ---
Write-Host "[INFO] Iniciando backup de $DB_NAME..."

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
    # Tentar caminho padrão do SQL Server
    $sqlcmdPaths = @(
        "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE",
        "C:\Program Files\Microsoft SQL Server\160\Tools\Binn\SQLCMD.EXE",
        "C:\Program Files\Microsoft SQL Server\150\Tools\Binn\SQLCMD.EXE",
        "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\SQLCMD.EXE"
    )
    foreach ($p in $sqlcmdPaths) {
        if (Test-Path $p) { $sqlcmd = $p; break }
    }
}

if (-not $sqlcmd) {
    Write-Host "[ERRO] sqlcmd nao encontrado. Instale SQL Server command line tools." -ForegroundColor Red
    exit 1
}

$query = "BACKUP DATABASE [$DB_NAME] TO DISK = N'$fullPath' WITH INIT, COMPRESSION, STATS = 10"

try {
    & $sqlcmd -S "localhost,1433" -U "mparking_app" -P "MParking@2026!" -Q $query 2>&1
    if ($LASTEXITCODE -eq 0 -and (Test-Path $fullPath)) {
        $size = [math]::Round((Get-Item $fullPath).Length / 1MB, 2)
        Write-Host "[OK] Backup criado: $fullPath (${size}MB)" -ForegroundColor Green
    } else {
        Write-Host "[ERRO] Backup pode ter falhado. Verifique permissoes." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERRO] Falha no backup: $_" -ForegroundColor Red
    exit 1
}

# --- Limpeza de backups antigos ---
Write-Host "[INFO] Removendo backups com mais de $RetainDays dias..."
$cutoff = (Get-Date).AddDays(-$RetainDays)
$old = Get-ChildItem $BackupDir -Filter "${DB_NAME}_*.bak" | Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old.Count -gt 0) {
    $old | Remove-Item -Force
    Write-Host "[INFO] Removidos $($old.Count) backups antigos" -ForegroundColor Yellow
} else {
    Write-Host "[INFO] Nenhum backup antigo para remover"
}

# --- Resumo ---
$remaining = (Get-ChildItem $BackupDir -Filter "${DB_NAME}_*.bak").Count
Write-Host "[INFO] Total backups retidos: $remaining"
Write-Host "`n=== Backup concluido ===" -ForegroundColor Cyan
