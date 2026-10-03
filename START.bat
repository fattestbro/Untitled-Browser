@echo off
setlocal

cd /d "%~dp0"

set "PORTABLE=dist\Untitled Browser 1.1.0.exe"

if not exist "%PORTABLE%" (
  echo Portable EXE was not found:
  echo   %PORTABLE%
  echo.
  echo Run BUILD.bat first, or download the packaged Windows build
  echo from the GitHub Release.
  pause
  exit /b 1
)

start "" "%PORTABLE%"
