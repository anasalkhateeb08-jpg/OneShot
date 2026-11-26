# Renders a picture of every model in F:\OneShot\library that has none yet (D-062).
#   .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-thumbs.ps1"
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$blender = 'F:\Tools\blender-5.2.4-windows-x64\blender.exe'
if (-not (Test-Path $blender)) { throw "Blender not found at $blender. Run tools\install-blender.ps1 first." }
$library = Join-Path $root 'library'
New-Item -ItemType Directory -Force -Path $library | Out-Null

$ErrorActionPreference = 'Continue'
& $blender -b -P (Join-Path $root 'tools\blender\thumbs.py') -- $library 256 2>&1 |
  ForEach-Object { Write-Output "$_" }
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { Write-Host "ERROR: Blender failed (code $code)"; exit 1 }
$count = (Get-ChildItem $library -Recurse -Filter '*.png').Count
Write-Host "Library pictures: $count"
