@echo off
chcp 65001 >nul
title One Shot - Handoff
color 0A
cd /d "%~dp0.."
echo ==================================================
echo    ONE SHOT  -  Handoff file generator
echo ==================================================
echo.
echo  This creates a NEW handoff file on your Desktop with:
echo   - the full plan and architecture
echo   - the current status and decision
echo   - all decisions and the progress log
echo.
echo  Give that file to a new chat to continue the project.
echo.
echo  Press ENTER to create it, or close this window to cancel.
pause >nul
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-handoff.ps1"
echo.
echo  Press any key to close.
pause >nul
