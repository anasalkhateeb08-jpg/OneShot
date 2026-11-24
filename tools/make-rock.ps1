# Builds game-ready levels of detail for one Poly Haven model with Blender (D-045).
# Usage (from F:\OneShot):
#   .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-rock.ps1 namaqualand_boulder_02"
# Result: .assets-pro\<id>\*.glb and a preview picture on the Desktop.
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

param(
  [Parameter(Mandatory = $true)][string]$Id,
  [string]$Tris = '3000,800,200',
  [int]$BakePx = 2048
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$blender = 'F:\Tools\blender-5.2.4-windows-x64\blender.exe'
if (-not (Test-Path $blender)) { throw "Blender not found at $blender. Run tools\install-blender.ps1 first." }

# Keep the big working folders out of Git.
$ignore = Join-Path $root '.gitignore'
$text = Get-Content $ignore -Raw
foreach ($entry in @('.assets-src/', '.assets-pro/')) {
  if ($text -notmatch [regex]::Escape($entry)) { Add-Content -Path $ignore -Value $entry }
}

Write-Host "1/2 Downloading the original model $Id (2k textures)..."
node tools/assets/fetch-sources.mjs $Id
if ($LASTEXITCODE -ne 0) { throw 'download failed' }

$srcDir = Join-Path $root ".assets-src\$Id"
$mainName = (Get-Content (Join-Path $srcDir 'main.txt') -Raw).Trim()
$gltf = Join-Path $srcDir $mainName
$outDir = Join-Path $root ".assets-pro\$Id"
$desktop = [Environment]::GetFolderPath('Desktop')
$preview = Join-Path $desktop "OneShot-preview-$Id.png"

Write-Host "2/2 Blender: decimate, bake, export, preview (a few minutes)..."
& $blender -b -P (Join-Path $root 'tools\blender\make_rock.py') -- $gltf $outDir $Id $Tris $BakePx $preview
if ($LASTEXITCODE -ne 0) { throw "Blender failed with code $LASTEXITCODE" }

Write-Host ""
Write-Host "Files: $outDir"
Get-ChildItem $outDir -Filter *.glb | ForEach-Object { "{0}  {1} KB" -f $_.Name, [int]($_.Length / 1KB) }
Write-Host "Preview picture on your Desktop: OneShot-preview-$Id.png"
