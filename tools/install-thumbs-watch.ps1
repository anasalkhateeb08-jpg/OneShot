# Installs the automatic library pictures (D-068): a hidden watcher that renders a picture
# next to every new .glb in F:\OneShot\library, started now and at every logon. Running it
# again replaces a watcher that is already running with the current version.
# No administrator rights needed: it is a shortcut in the user's Startup folder.
#   .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-thumbs-watch.ps1"
# To remove it: delete "OneShot Thumbs.lnk" from the Startup folder (Win+R, shell:startup)
# and stop the running one with tools\install-thumbs-watch.ps1 -Remove.
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$watch = Join-Path $PSScriptRoot 'watch-thumbs.ps1'
$startup = [Environment]::GetFolderPath('Startup')
$link = Join-Path $startup 'OneShot Thumbs.lnk'

# Stop any watcher that is running now.
$old = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*watch-thumbs.ps1*' }
foreach ($p in $old) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host ('Stopped the running watcher (process ' + $p.ProcessId + ').')
}
Start-Sleep -Seconds 1

if ($Remove) {
  if (Test-Path $link) { Remove-Item $link -Force; Write-Host "Removed $link" }
  Write-Host 'Automatic pictures are off.'
  exit 0
}

if (-not (Test-Path $watch)) { throw "Missing $watch" }
$psArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watch + '"'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($link)
$sc.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$sc.Arguments = $psArgs
$sc.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$sc.WindowStyle = 7
$sc.Description = 'OneShot: pictures for new library models'
$sc.Save()
Write-Host "Startup shortcut: $link"

Start-Process -FilePath $sc.TargetPath -ArgumentList $psArgs -WindowStyle Hidden
Write-Host 'Watcher started. It sleeps until a .glb arrives in F:\OneShot\library.'
Write-Host ('Log: ' + (Join-Path $env:TEMP 'oneshot-thumbs.log'))
