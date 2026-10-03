# Untitled Browser — build

The project targets Windows x64 and Electron 44.5.1. Electron 44.5.1 was the current stable Electron 44 release at the end of September 2026.

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
npm test
```

Build a Windows x64 folder:

```bash
npm run package:win
```

The packaged app is written to `dist/`. The project does not require Python or the Windows `py` launcher.
