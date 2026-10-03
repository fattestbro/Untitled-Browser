@echo off
setlocal
title Untitled Browser
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install a current Node.js LTS release, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\electron (
  echo Installing browser dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
call npm start
