# Watches F:\OneShot\library and renders a picture for every new or changed .glb (D-068).
# Started hidden at logon by the shortcut that tools\install-thumbs-watch.ps1 puts in the
# Startup folder. It checks every 10 seconds (cheap) and starts Blender only when a model
# has no picture yet, after the file has not changed for 5 seconds (download finished).
# A model that Blender could not render is not tried again until the file changes.
# Log: %TEMP%\oneshot-thumbs.log
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Continue'
$mutex = New-Object System.Threading.Mutex($false, 'Local\OneShotThumbsWatch')
if (-not $mutex.WaitOne(0)) { exit 0 }

$root = Split-Path -Parent $PSScriptRoot
$library = Join-Path $root 'library'
$make = Join-Path $PSScriptRoot 'make-thumbs.ps1'
$log = Join-Path $env:TEMP 'oneshot-thumbs.log'
$tried = @{}

while ($true) {
  $todo = @()
  if (Test-Path $library) {
    foreach ($glb in Get-ChildItem $library -Recurse -Filter '*.glb' -File -ErrorAction SilentlyContinue) {
      if ($glb.Extension -ne '.glb') { continue }
      $png = [System.IO.Path]::ChangeExtension($glb.FullName, '.png')
      $fresh = (Test-Path $png) -and ((Get-Item $png).LastWriteTime -ge $glb.LastWriteTime)
      if ($fresh) { continue }
      if (((Get-Date) - $glb.LastWriteTime).TotalSeconds -lt 5) { continue }
      $stamp = $glb.LastWriteTime.Ticks
      if ($tried.ContainsKey($glb.FullName) -and $tried[$glb.FullName] -eq $stamp) { continue }
      $todo += $glb
    }
  }
  if ($todo.Count -gt 0) {
    Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' rendering ' + $todo.Count + ' picture(s)')
    & powershell -NoProfile -ExecutionPolicy Bypass -File $make *>> $log
    foreach ($glb in $todo) { $tried[$glb.FullName] = $glb.LastWriteTime.Ticks }
  }
  Start-Sleep -Seconds 10
}
