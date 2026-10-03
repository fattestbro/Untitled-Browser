## 0.5.0 — 2026-10-03

Based on the supplied Untitled Browser 0.4.1 Windows build. Added fixed Discord Rich Presence, GitHub Project button, extra browser actions, download-folder selection and additional media/session settings without replacing the 0.4.1 shell design.

## 0.4.1

- Added live search suggestions to the address bar and New Tab search.
- Suggestions follow the selected search engine where supported, with safe provider fallbacks.
- Added keyboard selection and mouse selection for suggestions.
- Packaging target refreshed for Windows x64.

# Changelog

## 0.3.7
- Rich Presence now uses the current tab/page title as the primary activity detail.
- Media pages expose a watching/listening activity and, when available, current position / duration.
- Site/domain remains visible in the activity state.
- Search queries remain supported without replacing the page title.
- Added optional `Show page/video title` and `Add Open page button` settings.
- Activity refreshes periodically so changing media playback state is reflected in Discord.
- Incognito and internal pages remain privacy-safe and never expose their real URL/title.


## 0.3.6
- Expanded Discord Rich Presence with more humorous activity phrases.
- Shows the current website/domain in the Presence state.
- Detects search queries on major search engines and YouTube and shows them in the Presence details.
- Added Settings → Discord → Show current search query.
- Search query is sanitized and truncated before being sent to Discord; Incognito still hides site/search data.
- Host-specific phrases for YouTube, Google, GitHub, Reddit, Twitch, Spotify, Discord, Steam Community, Wikipedia and others.


## 0.3.5
- Replaced the old fire-and-forget Discord IPC code with a lock-step RPC manager.
- Uses Discord's documented Windows IPC pipe format.
- Waits for the `READY` event before sending `SET_ACTIVITY`.
- Parses fragmented/multiple IPC frames and reports Discord error codes/messages.
- Keeps the Application ID as an exact string and removes fake fixed-length validation.
- Prevents duplicate RPC connections and reconnects after Discord restarts.
- Sends a minimal Rich Presence without unverified image assets.
- Added Discord status and Test Connection to Settings.
- Corrected the Matoi error-sheet overlay alignment.

## 0.3.2
- Rebuilt internal pages as a native shell panel instead of a BrowserView file page.
- Fixed Settings, History, Downloads, Bookmarks, Extensions, Privacy, Performance, Task Manager and Shortcuts navigation.
- Internal routes now work consistently from the menu, Quick Links and keyboard shortcuts.
- Internal error pages use the same shell and keep Back/Retry/New Tab actions alive.

## 0.4.0
- New-tab background picker with local storage.
- Real site favicons in tabs.
- Russian/English primary UI language selection with optional Ukrainian/German/Spanish packs.
- Fixed bookmark icon vertical alignment.
- Repositioned Matoi error code overlay to the A4 sheet.
- Main-process keyboard shortcuts for Ctrl/Alt/F12 combinations.
- Security hardening: remote preload removed, navigation filtering, IPC sender validation, deny-by-default permissions, safer shell/download handlers.
- Security settings: HTTPS-only, DoH DNS, HTTP/HTTPS/SOCKS proxy, proxy bypass and domain split tunneling (PAC).
- Added security audit documentation.
