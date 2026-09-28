$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $projectRoot '.runtime'
$mysqlRoot = Join-Path $runtimeRoot 'mysql-8.4.6-winx64'
$dataRoot = Join-Path $runtimeRoot 'mysql-data'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $mysqlRoot 'bin\mysqld.exe'))) {
    $archivePath = Join-Path $runtimeRoot 'mysql.zip'
    Write-Host 'Downloading MySQL 8.4.6...'
    curl.exe -L --fail --silent --show-error 'https://cdn.mysql.com/archives/mysql-8.4/mysql-8.4.6-winx64.zip' -o $archivePath
    if ($LASTEXITCODE -ne 0) { throw 'MySQL download failed' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot -Force
}
$serverExe = Join-Path $mysqlRoot 'bin\mysqld.exe'
$clientExe = Join-Path $mysqlRoot 'bin\mysql.exe'
$isNew = !(Test-Path -LiteralPath (Join-Path $dataRoot 'mysql'))
if ($isNew) {
    & $serverExe --no-defaults --initialize-insecure "--basedir=$mysqlRoot" "--datadir=$dataRoot" --console
    if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed' }
}
$listener = Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue
if (!$listener) {
    $proc = Start-Process -FilePath $serverExe -ArgumentList @('--no-defaults',"--basedir=`"$mysqlRoot`"","--datadir=`"$dataRoot`"",'--port=3307','--bind-address=127.0.0.1','--mysqlx=0','--console') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeRoot 'mysql.out.log') -RedirectStandardError (Join-Path $runtimeRoot 'mysql.err.log')
    $proc.Id | Set-Content (Join-Path $runtimeRoot 'mysql.pid')
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        if (Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue) { break }
        Start-Sleep -Seconds 1
    }
}
if ($isNew) {
    $sql = "CREATE DATABASE IF NOT EXISTS mujian CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER IF NOT EXISTS 'mujian'@'127.0.0.1' IDENTIFIED BY 'mujian-local-demo-2026'; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,INDEX,REFERENCES,ALTER ON mujian.* TO 'mujian'@'127.0.0.1'; ALTER USER 'root'@'localhost' IDENTIFIED BY 'local-root-mujian-2026';"
    & $clientExe --no-defaults --host=127.0.0.1 --port=3307 --user=root --execute=$sql
    if ($LASTEXITCODE -ne 0) { throw 'MySQL account setup failed' }
}
Write-Host 'MySQL ready: 127.0.0.1:3307 / mujian'
