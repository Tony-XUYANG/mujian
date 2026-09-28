$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $projectRoot 'frontend')
try {
  npm.cmd ci --no-audit --no-fund
  if($LASTEXITCODE -ne 0){throw 'npm ci failed'}
  npm.cmd run build
  if($LASTEXITCODE -ne 0){throw 'Frontend build failed'}
} finally {Pop-Location}
$staticRoot=Join-Path $projectRoot 'backend\src\main\resources\static'
New-Item -ItemType Directory -Path $staticRoot -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'frontend\dist\*') -Destination $staticRoot -Recurse -Force
Push-Location (Join-Path $projectRoot 'backend')
try {mvn.cmd -B -ntp package;if($LASTEXITCODE -ne 0){throw 'Backend build failed'}} finally {Pop-Location}
Write-Host 'Build complete. Run start.cmd.'
