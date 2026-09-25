# PR Code Stats: Privacy Policy

Last updated: September 25, 2026

PR Code Stats runs entirely in your browser. It has no server, no analytics and no tracking.

## What it reads

When you open a pull request on github.com, the extension downloads that pull request's diff (or its file list) from GitHub to count added and removed lines per file. It uses your existing github.com session, or a GitHub token if you set one. These counts are kept in memory for about a minute and are never stored or sent anywhere else.

## What it stores

- Your "include tests" toggle and your test file patterns, in Chrome sync storage so they follow your Chrome profile.
- Which files the "Auto-view tests" switch marked as Viewed on each pull request, in Chrome local storage, so turning the switch off can undo exactly those.
- An optional GitHub token, in Chrome local storage on this device only. It is sent only to api.github.com, as the Authorization header of requests for the pull request you are viewing.

## What it sends

Requests go only to github.com, patch-diff.githubusercontent.com and api.github.com, and only to fetch the pull request you are viewing. No data is sent to the developer or to any third party. Nothing is sold or shared.

## Removing your data

Uninstalling the extension deletes everything it stored. You can also clear the token at any time on the options page.

## Contact

Open an issue at https://github.com/alexdeg92/pr-code-stats/issues
