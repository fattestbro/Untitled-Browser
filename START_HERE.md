# Start here

## Ready-made Windows build

The project is intended to be built by GitHub Actions. The workflow produces:

- `Untitled Browser Setup 1.2.0.exe` — Windows installer.
- `Untitled Browser 1.2.0.exe` — portable Windows build.

For normal users, download the installer EXE from the GitHub Release. You do not need Node.js to run the packaged EXE.

## Run from source

Developer requirements:

- Windows 10/11 x64
- Node.js 20+

Then run:

    npm install
    npm test
    npm start

## Build Windows EXE locally

Run:

    BUILD.bat

or:

    powershell -ExecutionPolicy Bypass -File .\BUILD.ps1

The generated files are placed in `dist\`.

## Quick launch

After a local build, run:

    START.bat

It launches the portable EXE from `dist\`.

## GitHub Actions

Every push to `main` runs tests and a Windows packaging job.

