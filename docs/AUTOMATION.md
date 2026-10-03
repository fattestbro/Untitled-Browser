# Automation

`UntitledBrowser.exe` is the user-facing launcher. The user does not need Node.js, npm, a terminal, START.cmd, or any build command to run the browser.

On first launch the launcher:

1. extracts the embedded browser payload;
2. downloads the pinned Windows x64 Electron runtime if it is missing;
3. verifies the runtime archive with SHA-256;
4. provisions Node.js 24.21.0 for optional open-source maintenance;
5. creates Desktop and Start Menu shortcuts;
6. starts the browser.

Normal use is always a direct `.exe` launch.
