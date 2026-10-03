# Untitled Browser

A small, open, privacy-oriented Chromium browser project designed to be easy to modify.

## Start without a build

You do **not** need Electron Builder, `npm run build`, `npm run dist`, Python, or the `py` launcher.

On Windows, double-click:

```text
START.cmd
```

The launcher automatically:

1. creates a local runtime folder;
2. downloads Node.js 24.21.0 if a local runtime is missing;
3. installs Electron and the browser dependencies;
4. stores the browser profile in the local `data` folder (portable mode);
5. starts Untitled Browser directly with Electron.

After the first setup, run `START.cmd` again to launch the browser.

### Optional helpers

- `UPDATE.cmd` — refresh npm dependencies.
- `RESET_PROFILE.cmd` — delete the portable browser profile and start clean.
- `INSTALL_SHORTCUT.cmd` — create an `Untitled Browser` desktop shortcut.
- `OPEN_PROJECT.cmd` — open the project folder.

The first automatic setup requires Internet access for the Node.js/Electron downloads. The browser itself can then start offline while the local runtime and dependencies remain present.

## Manual development

A normal Node.js installation also works:

```bash
npm install
npm start
```

Useful checks:

```bash
npm run check
npm test
```

There is intentionally no packaging/build command in the normal workflow. The project is meant to be edited and launched directly.

## Features

- Chromium tabs and navigation
- private/incognito tabs with separate sessions
- history and persistent download records
- bookmarks
- Chromium DevTools
- zoom controls
- drag-and-drop tab reordering
- custom internal pages
- custom error pages using the local Matoi artwork
- Discord Rich Presence (optional; the browser uses the built-in project Application ID)
- Picture-in-Picture
- screenshots
- privacy/data clearing controls
- proxy and custom User-Agent configuration
- performance/task-manager pages
- session restore
- local portable profile
- secure preload/context isolation

## Structure

- `src/main` — Electron main process, tabs, persistence, downloads, RPC and IPC.
- `src/preload` — secure renderer bridge.
- `src/renderer` — browser shell and internal pages.
- `assets/matoi` — local Matoi error-page art.
- `scripts` — automated Windows launcher and helper scripts.
- `data` — portable browser profile created at runtime.

## Privacy note

Untitled Browser is privacy-oriented, not an anonymity guarantee. It does not require an account and has no built-in telemetry layer.

Discord Rich Presence is optional. The Discord Application ID is built into the browser and is not editable from Settings.

Chromium extension support uses Electron's session extension APIs. Compatibility depends on the extension and the Chromium/Electron APIs it requires.


### Internal browser pages
Settings, History, Downloads, Bookmarks, Extensions, Privacy, Performance, Task Manager, Shortcuts and error recovery are rendered in the main browser shell. This avoids placing UI controls behind a BrowserView and keeps the pages connected to the same preload/API bridge.
### Windows EXE launcher

The distributed `UntitledBrowser-0.4.1.exe` is a self-contained Windows launcher. On first run it extracts the browser app into `%LOCALAPPDATA%\Untitled Browser` and downloads the pinned Electron 44.5.1 Windows x64 runtime, verifying its SHA-256 before launch. Node.js/npm are not required on the end-user PC.

Search autocomplete combines the selected search engine suggestions with local smart suggestions. Matching is case-insensitive and also supports simple Russian-to-Latin transliteration, so `роб` can surface `роблокс`, `roblox`, `робзи`, and `robzi`.
