# Untitled Browser Security Audit — 0.4.0

## Scope
Static review of the Electron main/preload/renderer boundary, navigation handlers, IPC, downloads, external links, permissions, proxy/DNS settings and custom error page.

## High-impact fixes
- Remote BrowserViews no longer receive the trusted preload bridge.
- Remote navigation/new-window protocols are restricted to HTTP(S), with file navigation only for an explicit local-file load.
- All renderer-to-main IPC handlers validate the sender window.
- Remote permission requests/checks default to deny.
- `shell.openExternal` is restricted to HTTP(S).
- Download/file shell operations are restricted to known download paths or the browser user-data directory.
- Unpacked extensions are loaded without `allowFileAccess`.
- Chromium web security and sandbox remain enabled.
- Optional HTTPS-only, DoH DNS, proxy and domain split tunneling were added.
- Security-sensitive values such as proxy passwords stay in local config and are never written to browser logs.

## Residual risk
A browser is exposed to arbitrary web content by design. Keep Electron updated and treat unpacked extensions as trusted software.
