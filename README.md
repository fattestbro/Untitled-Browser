# Untitled Browser

Windows-first Chromium browser built with Electron.

## Release 1.2.0

New-tab now contains a random YouTube video selected from five configured videos. Autoplay is requested with audio, with browser-level autoplay policy relaxed so the homepage can start media without a click.

Configured videos:
- https://www.youtube.com/watch?v=8L31g_3gcGU
- https://youtu.be/co1YijOZdfw
- https://youtu.be/IAHKBGU0dmc
- https://youtu.be/CZdzWpUQEKU
- https://youtu.be/RpbW_lIywmg

The new-tab video uses YouTube's privacy-enhanced embed host and standard player controls.

## Features

- Real Chromium pages in tabs
- Random YouTube video on the new-tab page
- Audio-enabled video autoplay on the new-tab page
- Fixed Discord Rich Presence with a GitHub Project button
- Discord Application ID is built into the release; there is no user setting or environment variable for a custom application
- New-tab quick links
- Address bar with search fallback
- Back / forward / reload / home
- Tab titles and favicons
- History and bookmarks
- Download tracking
- Settings and internal pages
- DevTools
- Single-instance behavior
- Safe HTTP(S)-only external shell opening
- Permission deny-by-default policy with a small allowlist
- contextIsolation, sandbox and disabled Node integration for the shell
- Windows x64 NSIS installer and portable EXE
- Node built-in automated tests
- GitHub Actions CI

## Repository helper files

- `START_HERE.md` — beginner guide
- `BUILD.bat` — one-click Windows build
- `BUILD.ps1` — PowerShell build
- `START.bat` — launches the local portable build
- `CLEAN.bat` — removes local build/dependency output

## Discord Rich Presence

When the Discord desktop client is running, Untitled Browser publishes a Rich Presence using the fixed application configured for this project. The activity updates with the current browser context and includes a `GitHub Project` button linking to the repository.

The Application ID is hardcoded in the application. There is no UI, environment variable, or command-line option for replacing it.

## Build

Requirements: Windows 10/11 x64 and Node.js 20+.

    npm install
    npm test
    npm start

For Windows installer and portable EXE:

    npm run package:win

Artifacts are created in `dist/`.

On Windows, `BUILD.bat` does install + test + package in one step.

The current Windows build is version 1.2.0:
- `Untitled Browser Setup 1.2.0.exe`
- `Untitled Browser 1.2.0.exe`

## Security

Remote web content does not receive the trusted Electron shell preload bridge. Chromium web security remains enabled. The project does not execute arbitrary website JavaScript through Node APIs.

Permissions are denied by default except for the small explicit allowlist. External URLs passed to the native shell are restricted to HTTP(S).

A browser is inherently exposed to arbitrary web content. Keep Electron updated and treat future native integrations and extensions as trusted software.

## License

MIT. See [LICENSE](LICENSE).
