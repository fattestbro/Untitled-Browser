@echo off
setlocal

cd /d "%~dp0"

echo ==========================================
echo        Untitled Browser - Windows Build
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 22.12+ is required.
  echo Install Node.js from https://nodejs.org/
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo Running tests...
call npm test
if errorlevel 1 (
  echo.
  echo ERROR: tests failed. Build stopped.
  pause
  exit /b 1
)

echo.
echo Building Windows installer and portable EXE...
call npx electron-builder --win nsis portable --publish never
if errorlevel 1 (
  echo.
  echo ERROR: Windows build failed.
  pause
  exit /b 1
)

echo.
echo BUILD COMPLETE.
echo Files are in the dist folder.
echo.
echo Installer:
echo   dist\Untitled Browser Setup 1.2.0.exe
echo.
echo Portable:
echo   dist\Untitled Browser 1.2.0.exe
echo.
pause
