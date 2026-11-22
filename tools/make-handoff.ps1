# Builds ONE handoff file with everything a new chat needs to continue the project:
# instructions, status, progress, vision, decisions, rules, workflow, architecture,
# performance, promotion plan, the full master prompt and add-on, the file list,
# and the recent git history.
#
# Output:
#   - Desktop\OneShot_HANDOFF_<date>_<time>.md   (a new file every run)
#   - <project>\HANDOFF.md                         (latest copy, not committed)
#
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
$docs = Join-Path $root 'docs'
$desktop = [Environment]::GetFolderPath('Desktop')
$utf8 = New-Object System.Text.UTF8Encoding $false
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$nowText = Get-Date -Format 'yyyy-MM-dd HH:mm'
$outDesktop = Join-Path $desktop ('OneShot_HANDOFF_' + $stamp + '.md')
$outProject = Join-Path $root 'HANDOFF.md'
$nl = "`n"

$sections = @(
  @{ File = 'HANDOFF_README.md';    Title = 'READ FIRST: how to continue this project' },
  @{ File = 'STATUS.md';            Title = 'Current status and decision' },
  @{ File = 'PROGRESS.md';          Title = 'Progress log' },
  @{ File = 'VISION.md';            Title = 'Vision: the feel we are chasing' },
  @{ File = 'DECISIONS.md';         Title = 'Decisions log' },
  @{ File = 'RULES.md';             Title = 'Game rules (current)' },
  @{ File = 'WORKFLOW.md';          Title = 'Owner working method' },
  @{ File = 'CHECKLISTS.md';        Title = 'Verification checklists' },
  @{ File = 'ARCHITECTURE.md';      Title = 'Architecture' },
  @{ File = 'PERF.md';              Title = 'Performance measurements' },
  @{ File = 'PROMOTION.md';         Title = 'Promotion plan' },
  @{ File = 'ASSET_LICENSES.md';    Title = 'Asset licenses' },
  @{ File = 'MASTER_PROMPT.md';     Title = 'MASTER PROMPT (source of truth)' },
  @{ File = 'ADDON_MOBILE_I18N.md'; Title = 'ADD-ON: mobile, localization, APK, versioning' }
)

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('# ONE SHOT - HANDOFF FILE' + $nl + $nl)
[void]$sb.Append('Generated: ' + $nowText + $nl)
[void]$sb.Append('Project folder on the owner''s PC: ' + $root + $nl + $nl)
[void]$sb.Append('Give this whole file to the new chat as the first message attachment.' + $nl)

# Table of contents
[void]$sb.Append($nl + '## Contents' + $nl + $nl)
$i = 1
foreach ($s in $sections) {
  [void]$sb.Append($i.ToString() + '. ' + $s.Title + $nl)
  $i++
}
[void]$sb.Append($i.ToString() + '. Repository snapshot (git and file list)' + $nl)

# Documents
$i = 1
foreach ($s in $sections) {
  $path = Join-Path $docs $s.File
  [void]$sb.Append($nl + $nl + '---' + $nl + $nl)
  [void]$sb.Append('# PART ' + $i.ToString() + ': ' + $s.Title + ' (docs/' + $s.File + ')' + $nl + $nl)
  if (Test-Path $path) {
    [void]$sb.Append([System.IO.File]::ReadAllText($path, $utf8).TrimEnd() + $nl)
  } else {
    [void]$sb.Append('(file missing)' + $nl)
  }
  $i++
}

# Repository snapshot
[void]$sb.Append($nl + $nl + '---' + $nl + $nl)
[void]$sb.Append('# PART ' + $i.ToString() + ': Repository snapshot' + $nl + $nl)
$hasGit = (Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $root '.git'))
if ($hasGit) {
  $branch = (git -C $root rev-parse --abbrev-ref HEAD 2>$null) -join ''
  $changes = @(git -C $root status --porcelain 2>$null).Count
  [void]$sb.Append('Branch: ' + $branch + $nl)
  [void]$sb.Append('Uncommitted changes: ' + $changes + $nl + $nl)
  [void]$sb.Append('## Last 30 commits' + $nl + $nl + '```text' + $nl)
  [void]$sb.Append(((git -C $root log -n 30 --date=short --pretty=format:'%h %ad %s' 2>$null) -join $nl) + $nl)
  [void]$sb.Append('```' + $nl + $nl)
  [void]$sb.Append('## Tracked files' + $nl + $nl + '```text' + $nl)
  [void]$sb.Append(((git -C $root ls-files 2>$null) -join $nl) + $nl)
  [void]$sb.Append('```' + $nl)
} else {
  [void]$sb.Append('(git repository not initialized yet)' + $nl + $nl)
  [void]$sb.Append('## Files' + $nl + $nl + '```text' + $nl)
  $files = Get-ChildItem -Path $root -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\(node_modules|dist|coverage|\.git)\\' } |
    ForEach-Object { $_.FullName.Substring($root.Length + 1).Replace('\', '/') }
  [void]$sb.Append(($files -join $nl) + $nl)
  [void]$sb.Append('```' + $nl)
}

$text = $sb.ToString()
[System.IO.File]::WriteAllText($outDesktop, $text, $utf8)
[System.IO.File]::WriteAllText($outProject, $text, $utf8)

$kb = [math]::Round($utf8.GetByteCount($text) / 1KB, 1)
Write-Host ''
Write-Host ('Handoff file created (' + $kb + ' KB):') -ForegroundColor Green
Write-Host ('  ' + $outDesktop) -ForegroundColor Green
Write-Host ('Latest copy also saved to: ' + $outProject)
