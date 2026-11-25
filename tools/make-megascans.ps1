# Builds game-ready levels of detail from Megascans downloads (Fab, "fbx High quality" zip) (D-046).
# Finds every <name>_<code>_high.zip in Downloads, unzips it to .assets-src\<name>\, then runs
# tools\blender\make_rock.py on its .fbx and textures.
# Usage (from F:\OneShot):
#   .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-megascans.ps1"
#   -Only desert_western_rock_medium_15   process one download only
#   -FlipGreen                            the normal map is DirectX style (lighting looks inverted)
# Result: .assets-pro\<name>\*.glb and a preview picture per rock on the Desktop.
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

param(
  [string]$Only = '',
  [switch]$FlipGreen,
  [string]$Tris = '3000,800,200',
  [int]$BakePx = 2048
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$blender = 'F:\Tools\blender-5.2.4-windows-x64\blender.exe'
if (-not (Test-Path $blender)) { throw "Blender not found at $blender. Run tools\install-blender.ps1 first." }

# Fab content must never be committed (Fab Standard License: no standalone redistribution).
$ignore = Join-Path $root '.gitignore'
$text = Get-Content $ignore -Raw
foreach ($entry in @('.assets-src/', '.assets-pro/')) {
  if ($text -notmatch [regex]::Escape($entry)) { Add-Content -Path $ignore -Value $entry }
}

$downloads = Join-Path $env:USERPROFILE 'Downloads'
$pattern = '^(.+)_[A-Za-z0-9]+_high$'
$zips = @(Get-ChildItem $downloads -Filter '*_high.zip' | Where-Object { $_.BaseName -match $pattern })
if ($Only) { $zips = @($zips | Where-Object { $_.BaseName -like "$Only*" }) }
if ($zips.Count -eq 0) { throw "No Megascans download (*_high.zip) found in $downloads" }

if ($FlipGreen) { $env:ONESHOT_FLIP_GREEN = '1' } else { $env:ONESHOT_FLIP_GREEN = '0' }
$desktop = [Environment]::GetFolderPath('Desktop')
$failed = 0

foreach ($zip in $zips) {
  $null = $zip.BaseName -match $pattern
  $id = $Matches[1].ToLower()
  Write-Host "=== $id"

  $srcDir = Join-Path $root ".assets-src\$id"
  if (Test-Path $srcDir) { Remove-Item -Recurse -Force $srcDir }
  Expand-Archive -Path $zip.FullName -DestinationPath $srcDir -Force
  $fbx = Get-ChildItem $srcDir -Recurse -Filter '*.fbx' | Select-Object -First 1
  if (-not $fbx) { Write-Host "ERROR: no .fbx inside $($zip.Name)"; $failed++; continue }

  $outDir = Join-Path $root ".assets-pro\$id"
  $preview = Join-Path $desktop "OneShot-preview-$id.png"
  Write-Host "Blender: decimate, bake, export, preview (a few minutes)..."
  # Blender prints its normal INFO and WARNING lines on stderr: pass them on as plain text so
  # PowerShell does not report a failure for them. Only Blender's exit code decides.
  $ErrorActionPreference = 'Continue'
  & $blender -b -P (Join-Path $root 'tools\blender\make_rock.py') -- $fbx.FullName $outDir $id $Tris $BakePx $preview 2>&1 |
    ForEach-Object { Write-Output "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($code -ne 0) { Write-Host "ERROR: Blender failed for $id (code $code)"; $failed++; continue }

  Get-ChildItem $outDir -Filter *.glb | ForEach-Object { "{0}  {1} KB" -f $_.Name, [int]($_.Length / 1KB) }
  Write-Host "Preview picture on your Desktop: OneShot-preview-$id.png"
}

if ($failed -gt 0) { Write-Host "ERROR: $failed download(s) failed"; exit 1 }
