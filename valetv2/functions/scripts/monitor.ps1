# ============================================
# 2M Parking — Monitor Health (PowerShell)
# Uso: .\scripts\monitor.ps1
# Pode ser configurado como Scheduled Task (a cada 5 min)
# ============================================
param(
    [string]$HealthUrl = "http://localhost:3000/health",
    [string]$LogFile   = "C:\Backups\MParking\monitor.log"
)

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Log($msg) {
    $line = "[$timestamp] $msg"
    Write-Host $line
    if ($LogFile) {
        $dir = Split-Path $LogFile -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line
    }
}

try {
    $resp = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 10 -ErrorAction Stop
    if ($resp.status -eq "ok") {
        Write-Log "OK  | v$($resp.version) | DB:$($resp.db) | Latency:$($resp.db_latency_ms)ms | Mem:$($resp.memory_mb)MB | Up:$($resp.uptime)s"
    } else {
        Write-Log "DEGRADED | v$($resp.version) | DB:$($resp.db) | Status:$($resp.status)"
    }
} catch {
    Write-Log "FAIL | Backend nao respondeu: $($_.Exception.Message)"

    # Tentar restart via PM2
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
    if ($pm2) {
        Write-Log "RESTART | Tentando reiniciar via PM2..."
        & pm2 restart 2m-parking-api 2>&1 | Out-Null
        Write-Log "RESTART | PM2 restart executado"
    }
}
