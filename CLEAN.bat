@echo off
setlocal

cd /d "%~dp0"

if exist "dist" rmdir /s /q "dist"
if exist "node_modules" rmdir /s /q "node_modules"

echo Clean complete.
pause
