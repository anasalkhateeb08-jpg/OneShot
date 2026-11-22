# Runs a command from the project root, shows its output live,
# then copies the command, exit code, and full output to the clipboard.
#
# Usage (from F:\OneShot):
#   .\tools\run.ps1 npm install
#   .\tools\run.ps1 npm run check
#
# Then paste (Ctrl+V) the result into the chat.
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]]$Command
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:FORCE_COLOR = '0'
$env:NO_COLOR = '1'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$line = $Command -join ' '
$started = Get-Date
$lines = New-Object System.Collections.Generic.List[string]

Write-Host "> $line" -ForegroundColor Cyan

cmd /c "chcp 65001 >nul & $line 2>&1" | ForEach-Object {
  $clean = ($_ -replace "\x1b\[[0-9;?]*[A-Za-z]", '')
  Write-Host $clean
  $lines.Add($clean)
}
$code = $LASTEXITCODE
$seconds = [int]((Get-Date) - $started).TotalSeconds

$body = $lines -join "`r`n"
$maxChars = 15000
if ($body.Length -gt $maxChars) {
  $head = $body.Substring(0, 3000)
  $tail = $body.Substring($body.Length - 11000)
  $body = $head + "`r`n... [output shortened for the clipboard] ...`r`n" + $tail
}

$report = "> $line`r`n(exit code $code, $seconds s, folder $root)`r`n`r`n$body"
Set-Clipboard -Value $report

if ($code -eq 0) {
  Write-Host "`n--- Done (exit code 0). Copied to clipboard: paste it in the chat. ---" -ForegroundColor Green
} else {
  Write-Host "`n--- FAILED (exit code $code). Copied to clipboard: paste it in the chat. ---" -ForegroundColor Red
}
