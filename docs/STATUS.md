# Status — 0.3.1

## Fixed in this release

- Duplicate three-dot menu icon removed.
- Main menu is now a native child window, so it remains visible above Chromium BrowserView content.
- Internal `untitled://` navigation now uses proper `file:` URLs under the hood.
- Error recovery no longer depends on browser history: Back, Retry and New tab use explicit recovery state.
- Error page shows the complete bundled Matoi photo and overlays the error code directly on the A4 sheet.
- Bookmark/favorite button is vertically centered and given a fixed hit area.
- New Tab Quick Links use a dedicated IPC route for internal pages.

## Core features present

- Electron Chromium browser window
- tabs and navigation
- normal and incognito tabs
- history persistence
- downloads
- bookmarks
- internal settings/history/downloads/bookmarks/extensions/about pages
- DevTools
- zoom
- screenshot capture
- Picture-in-Picture request
- optional Discord Rich Presence
- privacy/data clearing controls
- proxy/User-Agent settings scaffolding
- performance/task-manager pages
- session restore
- automated Windows launcher

## Verified in this environment

- JavaScript syntax checks pass.
- Node.js smoke tests pass.
- Windows x64 launcher compiles to a GUI PE executable.
- Embedded browser payload is present in the launcher source bundle.

## Requires a real Windows runtime check

- Chromium rendering against live websites
- automatic Electron/Node runtime download on Windows
- Discord IPC connection
- native Windows shortcut creation
- actual camera/microphone/notification permission prompts
- third-party extension compatibility
