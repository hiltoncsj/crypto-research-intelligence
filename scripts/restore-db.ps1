# scripts/restore-db.ps1
#
# Restore de um backup gerado por scripts/backup-db.ps1, executando pg_restore DENTRO do
# container `infrastructure-postgres-1` (mesma justificativa de backup-db.ps1: sem client
# Postgres no PATH do host).
#
# NÃO destrutivo por padrão:
# - Recusa restaurar no database 'crypto_research' (o banco principal de dev) — sempre.
# - Se o database de destino já existir com tabelas, exige -Confirm.
# - -CreateIfMissing cria o database de destino se ele não existir (uso esperado: banco de
#   teste isolado tipo crypto_research_restore_test).
#
# Uso (exemplo - restore em banco de teste isolado, NUNCA no banco principal):
#   powershell -File scripts/restore-db.ps1 -BackupFile backups/crypto_research_20260922_120000.dump `
#       -TargetDatabase crypto_research_restore_test -CreateIfMissing

param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$TargetDatabase,
    [switch]$Confirm,
    [switch]$CreateIfMissing,
    [string]$ContainerName = "infrastructure-postgres-1"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
    throw "Arquivo de backup não encontrado: $BackupFile"
}

if ($TargetDatabase -eq "crypto_research") {
    throw "RECUSADO: -TargetDatabase 'crypto_research' é o banco principal de desenvolvimento. Este script só restaura em bancos isolados."
}

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
if (-not $env:DATABASE_URL) { throw "DATABASE_URL não definida." }
if ($env:DATABASE_URL -notmatch 'postgresql://([^:]+):([^@]+)@') {
    throw "Não foi possível parsear usuário da DATABASE_URL."
}
$pgUser = $Matches[1]

$running = & docker ps --filter "name=$ContainerName" --format "{{.Names}}"
if (-not $running) {
    throw "Container '$ContainerName' não está rodando."
}

$dbExists = & docker exec $ContainerName psql -U $pgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$TargetDatabase'"

if (-not $dbExists) {
    if (-not $CreateIfMissing) {
        throw "Database '$TargetDatabase' não existe. Rode novamente com -CreateIfMissing."
    }
    Write-Host "Criando database de destino isolado: $TargetDatabase"
    & docker exec $ContainerName createdb -U $pgUser $TargetDatabase
    if ($LASTEXITCODE -ne 0) { throw "createdb falhou com exit code $LASTEXITCODE." }
} else {
    $tableCount = & docker exec $ContainerName psql -U $pgUser -d $TargetDatabase -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'"
    if ([int]$tableCount.Trim() -gt 0 -and -not $Confirm) {
        throw "Database '$TargetDatabase' já existe e tem $($tableCount.Trim()) tabela(s). Rode novamente com -Confirm."
    }
}

$backupFileName = Split-Path $BackupFile -Leaf
$containerTmpFile = "/tmp/$backupFileName"

& docker cp $BackupFile "${ContainerName}:${containerTmpFile}"
if ($LASTEXITCODE -ne 0) { throw "docker cp (host -> container) falhou com exit code $LASTEXITCODE." }

Write-Host "Restaurando '$BackupFile' em '$TargetDatabase'..."
& docker exec $ContainerName pg_restore --username=$pgUser --dbname=$TargetDatabase --no-owner --no-privileges --clean --if-exists $containerTmpFile

$restoreExit = $LASTEXITCODE
& docker exec $ContainerName rm -f $containerTmpFile

if ($restoreExit -ne 0) {
    throw "pg_restore terminou com exit code $restoreExit (revisar output acima - pg_restore pode retornar nao-zero por warnings nao-fatais de ordem de objetos; investigar antes de considerar sucesso)."
}

Write-Host "Restore concluído em '$TargetDatabase'."
