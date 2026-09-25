# PR Code Stats

Chrome extension that shows a GitHub pull request's line count without test files, with a toggle to include them.

## Develop

1. `chrome://extensions`, turn on Developer mode, "Load unpacked", pick this folder.
2. After editing, click the reload icon on the extension card.

## Release

1. Bump `version` in `manifest.json`.
2. `./build.sh` and upload the zip from `dist/` in the Chrome Web Store developer dashboard.

Listing text and permission justifications are in `store/LISTING.md`.
