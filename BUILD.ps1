$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Untitled Browser - Windows Build ==="

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22.12+ is required."
}

npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

npm test
if ($LASTEXITCODE -ne 0) { throw "Tests failed. Build stopped." }

npx electron-builder --win nsis portable --publish never
if ($LASTEXITCODE -ne 0) { throw "Windows build failed." }

Write-Host ""
Write-Host "BUILD COMPLETE"
Write-Host "Installer: dist\Untitled Browser Setup 1.2.0.exe"
Write-Host "Portable:  dist\Untitled Browser 1.2.0.exe"
