# Installs Blender (portable ZIP, no admin rights, no winget) into F:\Tools.
# Run from F:\OneShot:  .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-blender.ps1"
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$version = '5.2.4'
$series = '5.2'
$url = "https://download.blender.org/release/Blender$series/blender-$version-windows-x64.zip"
$root = 'F:\Tools'
$zip = Join-Path $root "blender-$version-windows-x64.zip"
$exe = Join-Path $root "blender-$version-windows-x64\blender.exe"

New-Item -ItemType Directory -Force -Path $root | Out-Null

if (Test-Path $exe) {
  Write-Host "Blender $version is already installed."
} else {
  if (-not (Test-Path $zip)) {
    Write-Host "Downloading Blender $version (about 400 MB, a few minutes)..."
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  }
  $mb = [int]((Get-Item $zip).Length / 1MB)
  Write-Host "Downloaded: $mb MB. Extracting..."
  Expand-Archive -Force -Path $zip -DestinationPath $root
}

if (-not (Test-Path $exe)) {
  throw "blender.exe was not found at $exe after extraction."
}

Write-Host "Blender path: $exe"
& $exe --background --version
Write-Host "Done. Blender is ready."
