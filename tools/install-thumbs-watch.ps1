# Installs the automatic library pictures (D-068): a hidden watcher that renders a picture
# next to every new .glb in F:\OneShot\library, started now and at every logon.
# No administrator rights needed: it is a shortcut in the user's Startup folder.
#   .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-thumbs-watch.ps1"
# To remove it: delete "OneShot Thumbs.lnk" from the Startup folder (Win+R, shell:startup).
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Stop'
$watch = Join-Path $PSScriptRoot 'watch-thumbs.ps1'
if (-not (Test-Path $watch)) { throw "Missing $watch" }
$psArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $watch + '"'

$startup = [Environment]::GetFolderPath('Startup')
$link = Join-Path $startup 'OneShot Thumbs.lnk'
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
Write-Host 'Watcher started. New models in F:\OneShot\library get a picture within about 15 s.'
Write-Host ('Log: ' + (Join-Path $env:TEMP 'oneshot-thumbs.log'))
