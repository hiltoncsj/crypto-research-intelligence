# scripts/backup-db.ps1
#
# Backup do Postgres de desenvolvimento/produção controlada do Crypto Research Intelligence.
#
# Estratégia: executa pg_dump DENTRO do container `infrastructure-postgres-1` (docker-compose),
# em vez de exigir um client Postgres instalado na máquina host — mais robusto neste setup
# (Windows dev machine, sem pg_dump/psql no PATH; o container já tem a versão correta,
# postgres:16-alpine). Formato custom (-Fc): comprimido, restaurável seletivamente com pg_restore.
#
# Requisitos:
# - Container do compose rodando (`docker compose -f infrastructure/docker-compose.yml up -d`).
# - DATABASE_URL definida (lida do .env da raiz se não estiver no ambiente) — usada só para
#   extrair user/db, nunca logada com a senha.
#
# Uso:
#   powershell -File scripts/backup-db.ps1 [-OutDir backups] [-ContainerName infrastructure-postgres-1]
#
# Nunca sobrescreve backup existente: nome do arquivo inclui timestamp UTC.
# Falha explicitamente (não continua silenciosamente) em qualquer erro.

param(
    [string]$OutDir = "backups",
    [string]$ContainerName = "infrastructure-postgres-1"
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
    $envFile = Join-Path $PSScriptRoot "..\.env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
        if ($line) {
            $value = ($line -replace '^DATABASE_URL=', '').Trim('"')
            $env:DATABASE_URL = $value
        }
    }
}
if (-not $env:DATABASE_URL) {
    throw "DATABASE_URL não definida (nem no ambiente nem no .env da raiz). Abortando backup."
}

if ($env:DATABASE_URL -notmatch 'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') {
    throw "Não foi possível parsear DATABASE_URL (esperado postgresql://user:pass@host:port/db)."
}
$pgUser = $Matches[1]
$pgDb = $Matches[5]

$running = & docker ps --filter "name=$ContainerName" --format "{{.Names}}"
if (-not $running) {
    throw "Container '$ContainerName' não está rodando. Suba com: docker compose -f infrastructure/docker-compose.yml up -d"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backupDir = Join-Path $repoRoot $OutDir
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmmss")
$backupFile = Join-Path $backupDir "crypto_research_$timestamp.dump"
$containerTmpFile = "/tmp/backup_$timestamp.dump"

if (Test-Path $backupFile) {
    throw "Arquivo de backup já existe: $backupFile. Abortando em vez de sobrescrever."
}

Write-Host "Iniciando backup do banco '$pgDb' (usuário '$pgUser') via container '$ContainerName'..."

& docker exec $ContainerName pg_dump --format=custom --no-owner --no-privileges --username=$pgUser --dbname=$pgDb --file=$containerTmpFile
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump (dentro do container) falhou com exit code $LASTEXITCODE. Backup NÃO foi criado."
}

& docker cp "${ContainerName}:${containerTmpFile}" $backupFile
if ($LASTEXITCODE -ne 0) {
    throw "docker cp falhou com exit code $LASTEXITCODE ao copiar o dump para o host."
}

& docker exec $ContainerName rm -f $containerTmpFile

$size = (Get-Item $backupFile).Length
if ($size -eq 0) {
    Remove-Item $backupFile -Force
    throw "Backup gerado está vazio. Removido; considerar FALHA."
}

Write-Host "Backup criado com sucesso: $backupFile ($([math]::Round($size/1MB, 2)) MB)"
Write-Host ""
Write-Host "IMPORTANTE: este backup contém apenas o schema/dados do Postgres."
Write-Host "MASTER_ENCRYPTION_KEY NAO esta neste backup (por design) e deve ser guardada"
Write-Host "separadamente - sem ela, os secrets em api_connections.encrypted_secret ficam irrecuperaveis."
