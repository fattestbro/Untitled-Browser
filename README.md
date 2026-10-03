# Untitled Browser

Windows-first Chromium browser built with Electron.

## Release 1.0.0

A clean public baseline with real tabs, Chromium web content, history, bookmarks, downloads, search/address handling, favicons, internal pages, keyboard shortcuts, DevTools, a security-oriented Electron boundary, automated tests and Windows x64 packaging.

## Features

- Real Chromium pages in tabs
- New-tab page and quick links
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
- GitHub Actions CI and Windows packaging

## Build

Requirements: Windows 10/11 x64 and Node.js 20+.

    npm install
    npm test
    npm start

For Windows installer and portable EXE:

    npm run package:win

Artifacts are created in `dist/`.

## Security

Remote web content does not receive the trusted Electron shell preload bridge. Chromium web security remains enabled. The project does not execute arbitrary website JavaScript through Node APIs.

Permissions are denied by default except for the small explicit allowlist. External URLs passed to the native shell are restricted to HTTP(S).

A browser is inherently exposed to arbitrary web content. Keep Electron updated and treat extensions or future native integrations as trusted software.

## CI

Pushes and pull requests run the test suite. Pushes to main additionally build Windows x64 installer and portable artifacts.

## License

MIT. See [LICENSE](LICENSE).
