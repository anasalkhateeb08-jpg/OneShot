# Batch maker for AI-generated models (D-060). Drop as many .glb files as you like into
# F:\OneShot\inbox (TRELLIS downloads named sample*.glb are picked up from Downloads by
# themselves), then run this once:
#   .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-ai-kit.ps1"
# Each new file is rebuilt by tools\blender\make_ai_model.py (clean skin, 3 detail levels, baked
# color and detail, automatic check). Good ones join the editor's model list (N key) as
# "ai_<file name>"; failed ones are listed. A preview of each is saved in
# Desktop\OneShot-previews. Files already made are skipped (use -Redo to make them again).
# Rename a file in the inbox (e.g. desert_rock_big.glb) to give the model a readable name.
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

param(
  [string]$Tris = '3000,800,200',
  [int]$TexturePx = 1024,
  [switch]$Redo
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$blender = 'F:\Tools\blender-5.2.4-windows-x64\blender.exe'
if (-not (Test-Path $blender)) { throw "Blender not found at $blender. Run tools\install-blender.ps1 first." }

$ignore = Join-Path $root '.gitignore'
$text = Get-Content $ignore -Raw
foreach ($entry in @('.assets-src/', '.assets-pro/', 'inbox/')) {
  if ($text -notmatch [regex]::Escape($entry)) { Add-Content -Path $ignore -Value $entry }
}

$inbox = Join-Path $root 'inbox'
New-Item -ItemType Directory -Force -Path $inbox | Out-Null
$downloads = Join-Path $env:USERPROFILE 'Downloads'
Get-ChildItem $downloads -Filter 'sample*.glb' -ErrorAction SilentlyContinue | ForEach-Object {
  $stamp = $_.LastWriteTime.ToString('yyyyMMdd_HHmmss')
  $dest = Join-Path $inbox "trellis_$stamp.glb"
  Move-Item -Force $_.FullName $dest
  Write-Host "inbox: $($_.Name) -> trellis_$stamp.glb"
}

$outDir = Join-Path $root '.assets-pro\ai-kit'
$lodDir = Join-Path $root '.assets-pro\ai-kit-lod'
$previewDir = Join-Path ([Environment]::GetFolderPath('Desktop')) 'OneShot-previews'
New-Item -ItemType Directory -Force -Path $outDir, $lodDir, $previewDir | Out-Null

$files = @(Get-ChildItem $inbox -Filter '*.glb')
if ($files.Count -eq 0) { throw "The inbox is empty: put .glb files in $inbox" }

$made = 0
$skipped = 0
$failed = @()
foreach ($file in $files) {
  $id = ($file.BaseName.ToLower() -replace '[^a-z0-9]+', '_').Trim('_')
  $out = Join-Path $outDir "$id.glb"
  if (-not $Redo -and (Test-Path $out) -and ((Get-Item $out).LastWriteTime -gt $file.LastWriteTime)) {
    $skipped++
    continue
  }
  Write-Host "=== $id ($([int]($file.Length / 1KB)) KB)"
  if (Test-Path $out) { Remove-Item -Force $out }
  $preview = Join-Path $previewDir "$id.png"
  $ErrorActionPreference = 'Continue'
  & $blender -b -P (Join-Path $root 'tools\blender\make_ai_model.py') -- $file.FullName $outDir $lodDir $id $Tris $TexturePx $preview 2>&1 |
    ForEach-Object { Write-Output "$_" }
  $ErrorActionPreference = 'Stop'
  if (Test-Path $out) { $made++ } else { $failed += $id; Write-Host "FAILED: $id" }
}

if ((Get-ChildItem $outDir -Filter '*.glb').Count -gt 0) {
  node tools/assets/import-glb-kit.mjs .assets-pro/ai-kit ai ai
  if ($LASTEXITCODE -ne 0) { throw "import into the game failed" }
}
Write-Host "Summary: $made made, $skipped already done, $($failed.Count) failed $($failed -join ', ')"
Write-Host "Previews: $previewDir"
if ($failed.Count -gt 0) { exit 1 }
