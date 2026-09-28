$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'init-db.ps1')
if (!(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)) {
  $jar=Join-Path $projectRoot 'backend\target\mujian-1.0.0.jar'
  if (!(Test-Path -LiteralPath $jar)) { throw 'Run build.ps1 before starting.' }
  $java=(Get-Command java.exe).Source
  $proc=Start-Process -FilePath $java -ArgumentList @('-jar',"`"$jar`"") -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.runtime\app.log') -RedirectStandardError (Join-Path $projectRoot '.runtime\app.err.log')
  $proc.Id | Set-Content (Join-Path $projectRoot '.runtime\app.pid')
}
for($attempt=0;$attempt -lt 40;$attempt++) {
  try { $health=Invoke-RestMethod 'http://127.0.0.1:8080/api/health'; if($health.status -eq 'UP'){Write-Host 'Mujian ready: http://127.0.0.1:8080';exit 0} } catch {}
  Start-Sleep -Seconds 1
}
throw 'Application did not become ready. Check .runtime/app.log.'
