# Records progress: rewrites docs/STATUS.md, appends one line to docs/PROGRESS.md,
# and makes a git commit (checkpoint) unless -NoCommit is given.
#
# Usage (from F:\OneShot), the AI gives you the exact command each time:
#   .\tools\update-status.ps1 -Phase "Phase 0" -Status "..." -Decision "..." -Next "..."
#
# -Phase is optional: if omitted, the phase from the current STATUS.md is kept.
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).
# Note: PowerShell variable names are case-insensitive, so never reuse a parameter name
# ($Status, $Decision, $Next, $Phase) for another variable.

param(
  [Parameter(Mandatory = $true)][string]$Status,
  [Parameter(Mandatory = $true)][string]$Decision,
  [string]$Next = '',
  [string]$Phase = '',
  [switch]$NoCommit
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
$docs = Join-Path $root 'docs'
$statusFile = Join-Path $docs 'STATUS.md'
$progressFile = Join-Path $docs 'PROGRESS.md'
$utf8 = New-Object System.Text.UTF8Encoding $false
$now = Get-Date -Format 'yyyy-MM-dd HH:mm'

if ($Phase -eq '' -and (Test-Path $statusFile)) {
  $old = [System.IO.File]::ReadAllText($statusFile, $utf8)
  $m = [regex]::Match($old, '## Phase\s*\r?\n\s*\r?\n(?<p>[^\r\n]+)')
  if ($m.Success) { $Phase = $m.Groups['p'].Value.Trim() }
}
if ($Phase -eq '') { $Phase = '(unknown)' }
if ($Next -eq '') { $Next = '(not set)' }

$nl = "`n"
$statusDoc = '# STATUS' + $nl + $nl +
  'Last updated: ' + $now + $nl + $nl +
  '## Phase' + $nl + $nl + $Phase + $nl + $nl +
  '## Status' + $nl + $nl + $Status + $nl + $nl +
  '## Decision' + $nl + $nl + $Decision + $nl + $nl +
  '## Next step' + $nl + $nl + $Next + $nl
[System.IO.File]::WriteAllText($statusFile, $statusDoc, $utf8)

if (-not (Test-Path $progressFile)) {
  [System.IO.File]::WriteAllText($progressFile, '# PROGRESS' + $nl + $nl, $utf8)
}
$entry = '- ' + $now + ' | ' + $Phase + ' | ' + $Status + ' | Decision: ' + $Decision + $nl
[System.IO.File]::AppendAllText($progressFile, $entry, $utf8)

Write-Host 'STATUS.md updated and PROGRESS.md appended.' -ForegroundColor Green

if (-not $NoCommit -and (Test-Path (Join-Path $root '.git'))) {
  $ErrorActionPreference = 'Continue'
  git -C $root add -A
  git -C $root commit -q -m ("progress: " + $Phase + " | " + $Status)
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'Git checkpoint committed.' -ForegroundColor Green
  } else {
    Write-Host 'Git commit skipped (nothing to commit, or git needs setup).' -ForegroundColor Yellow
  }
}
