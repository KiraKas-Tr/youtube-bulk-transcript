# Bulk YouTube Transcript Saver

Local-first Chrome MV3 extension for saving public YouTube captions from up to 50 video URLs as Markdown, TXT, JSON, plus `index.csv`, `failed.csv`, and `metadata.json` reports.

## Install / load locally

### Option 1: Use the committed build

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `dist/` folder, not the repository root.

Chrome requires `manifest.json` to be in the folder you select. The built extension manifest is at `dist/manifest.json`.

### Option 2: Rebuild from source

```bash
npm install
npm run build
```

Then load the generated `dist/` folder in `chrome://extensions`.

## YouTube navbar button

When loaded, the extension injects an **Add to saver** button into the YouTube top-right navbar on watch and Shorts pages. Clicking it stores the current video URL and opens the saver in Chrome's side panel with the captured URL prefilled.

## Development

```bash
npm test
npm run typecheck
npm run build
```

## Scope

- No login.
- No backend or uploads.
- No AI/audio transcription.
- Uses `chrome.storage`, File System Access API, and narrow YouTube host permissions.
