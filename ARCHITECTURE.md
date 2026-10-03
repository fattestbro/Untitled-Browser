# Architecture

The app uses an Electron BrowserWindow as the UI shell and a BrowserView for each browser tab. The renderer never receives Node.js access directly. Main-process features are exposed through a narrow context-isolated preload API.

Persistent JSON data lives under Electron's userData path:
- `config.json`
- `history.json`
- `bookmarks.json`

Internal pages are loaded from `src/renderer/internal.html` and selected with a hash route such as `#settings` or `#error?...`.

Error-page artwork is local in `assets/matoi/error-main.png`; the browser does not fetch the image from a remote server.
