# Creates the desktop icon "OneShot Handoff".
# Double-click it, press ENTER, and a new handoff file appears on the Desktop.
# Run once (from F:\OneShot):  .\tools\install-shortcut.ps1
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $PSScriptRoot 'handoff.cmd'
$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop 'OneShot Handoff.lnk'

if (-not (Test-Path $target)) { throw "Missing $target" }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$env:WINDIR\System32\shell32.dll,70"
$shortcut.Description = 'Create a new One Shot handoff file on the Desktop'
$shortcut.Save()

Write-Host "Desktop icon created: $link" -ForegroundColor Green
