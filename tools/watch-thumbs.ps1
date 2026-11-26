# Renders a picture for every new or changed .glb in F:\OneShot\library (D-068).
# Started hidden at logon by the shortcut that tools\install-thumbs-watch.ps1 puts in the
# Startup folder. It SLEEPS until Windows reports a .glb created, changed or renamed in the
# library (FileSystemWatcher: no polling, no CPU while waiting). Then it waits until the
# files stop changing for 5 seconds (copy or download finished) and runs make-thumbs.ps1
# (Blender) once. A model that Blender could not render is not tried again until it changes.
# Log: %TEMP%\oneshot-thumbs.log
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Continue'
$mutex = New-Object System.Threading.Mutex($false, 'Local\OneShotThumbsWatch')
try {
  if (-not $mutex.WaitOne(0)) { exit 0 }
} catch [System.Threading.AbandonedMutexException] {
  # the previous watcher was stopped: the mutex is ours now
}

$root = Split-Path -Parent $PSScriptRoot
$library = Join-Path $root 'library'
$make = Join-Path $PSScriptRoot 'make-thumbs.ps1'
$log = Join-Path $env:TEMP 'oneshot-thumbs.log'
$tried = @{}
New-Item -ItemType Directory -Force -Path $library | Out-Null

function Render-Missing {
  $todo = @()
  foreach ($glb in Get-ChildItem $library -Recurse -Filter '*.glb' -File -ErrorAction SilentlyContinue) {
    if ($glb.Extension -ne '.glb') { continue }
    $png = [System.IO.Path]::ChangeExtension($glb.FullName, '.png')
    if ((Test-Path $png) -and ((Get-Item $png).LastWriteTime -ge $glb.LastWriteTime)) { continue }
    $stamp = $glb.LastWriteTime.Ticks
    if ($tried.ContainsKey($glb.FullName) -and $tried[$glb.FullName] -eq $stamp) { continue }
    $todo += $glb
  }
  if ($todo.Count -eq 0) { return }
  Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' rendering ' + $todo.Count + ' picture(s)')
  & powershell -NoProfile -ExecutionPolicy Bypass -File $make *>> $log
  foreach ($glb in $todo) { $tried[$glb.FullName] = $glb.LastWriteTime.Ticks }
}

$fsw = New-Object System.IO.FileSystemWatcher($library, '*.glb')
$fsw.IncludeSubdirectories = $true
$fsw.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
$kinds = [System.IO.WatcherChangeTypes]'Created, Changed, Renamed'

Render-Missing
while ($true) {
  # Sleeps here, without using the processor, until a .glb arrives or changes.
  $null = $fsw.WaitForChanged($kinds)
  # Then waits until nothing has changed for 5 seconds.
  while (-not $fsw.WaitForChanged($kinds, 5000).TimedOut) { }
  Render-Missing
}
