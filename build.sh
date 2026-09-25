#!/bin/sh
# Builds the zip to upload to the Chrome Web Store.
set -e
cd "$(dirname "$0")"
version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' manifest.json)
mkdir -p dist
out="dist/pr-code-stats-$version.zip"
rm -f "$out"
zip -q "$out" manifest.json background.js content.js content.css patterns.js options.html options.js icons/*.png
echo "$out"
