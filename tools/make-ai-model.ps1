# Turns an AI-generated model (TRELLIS .glb, D-059) into game-ready detail levels with Blender.
# Takes the newest .glb in Downloads, copies it to .assets-src\<Name>\source.glb and runs
# tools\blender\make_rock.py: 3 levels (3000 / 800 / 200 triangles), baked normal map, preview
# picture on the Desktop.
# Usage (from F:\OneShot):
#   .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-ai-model.ps1 -Name ai_rock_01"
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Tris = '3000,800,200',
  [int]$BakePx = 2048
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if ($Name -notmatch '^[a-z0-9_]+$') { throw "Name must be lowercase letters, digits and _ only" }

$blender = 'F:\Tools\blender-5.2.4-windows-x64\blender.exe'
if (-not (Test-Path $blender)) { throw "Blender not found at $blender. Run tools\install-blender.ps1 first." }

$downloads = Join-Path $env:USERPROFILE 'Downloads'
$glb = Get-ChildItem $downloads -Filter '*.glb' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $glb) { throw "No .glb file found in $downloads" }
Write-Host "=== $Name from $($glb.Name) ($([int]($glb.Length / 1KB)) KB)"

$srcDir = Join-Path $root ".assets-src\$Name"
New-Item -ItemType Directory -Force -Path $srcDir | Out-Null
$src = Join-Path $srcDir 'source.glb'
Copy-Item -Force $glb.FullName $src

$outDir = Join-Path $root ".assets-pro\$Name"
$preview = Join-Path ([Environment]::GetFolderPath('Desktop')) "OneShot-preview-$Name.png"
Write-Host "Blender: decimate, bake, export, preview (a few minutes)..."
$env:ONESHOT_PLANAR = '1'
$ErrorActionPreference = 'Continue'
& $blender -b -P (Join-Path $root 'tools\blender\make_rock.py') -- $src $outDir $Name $Tris $BakePx $preview 2>&1 |
  ForEach-Object { Write-Output "$_" }
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { Write-Host "ERROR: Blender failed (code $code)"; exit 1 }
Get-ChildItem $outDir -Filter *.glb | ForEach-Object { "{0}  {1} KB" -f $_.Name, [int]($_.Length / 1KB) }
Write-Host "Preview picture on your Desktop: OneShot-preview-$Name.png"
